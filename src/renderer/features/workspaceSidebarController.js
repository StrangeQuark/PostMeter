function selectInitialWorkspaceItem() {
  selectedWorkspaceId ||= activeWorkspaceId || workspaceListItems()[0]?.id || null;
  activeMainPanel = 'request';
  activeRunnerConfigId = null;
  activeRunnerRequestRunnerId = null;
  resetRequestTabs();
  const collection = workspace.collections[0];
  activeCollectionId = collection?.id;
  if (collection) {
    selectFirstRequest(collection);
    ensureOpenRequestTabForActive();
  } else {
    clearActiveWorkspaceItem();
  }
}

function selectFirstRequest(collection) {
  const request = firstRequestInCollection(collection);
  activeRunnerRequestRunnerId = null;
  activeFolderId = request?.folderId || null;
  activeRequestId = request?.request?.id || null;
}

function renderCollections() {
  const root = $('collectionsTree');
  root.textContent = '';
  pruneCollectionTreeCollapseState(state, workspace.collections || []);
  if (!workspace.collections.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No collections';
    root.append(empty);
    return;
  }
  appendSidebarTreeRows(root, workspace.collections.map(collectionNode));
}

function renderEnvironments() {
  const root = $('environmentsList');
  root.textContent = '';
  if (!workspace.environments?.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No environments';
    root.append(empty);
    return;
  }
  appendSidebarTreeRows(root, workspace.environments.map(environmentNode));
}

function environmentNode(environment) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node environment-node';
  const button = treeButton(environment.name || 'Untitled Environment', environment.id === activeEnvironmentEditorId, 'ENV', {
    treeKind: 'environment',
    treeId: environment.id
  });
  appendSidebarTreeRow(wrapper, button, {
    kind: 'environment',
    id: environment.id
  });
  button.addEventListener('click', () => {
    if (!canOpenEnvironmentTabFor(environment.id)) {
      return;
    }
    collectActiveEditorState();
    activeRunnerRequestRunnerId = null;
    activeEnvironmentEditorId = environment.id;
    activeSidebarPanel = 'environments';
    activeMainPanel = 'environment';
    ensureOpenEnvironmentTabForActive();
    renderAll();
  });
  attachTreeContextMenu(button, [
    ['Rename', () => renameEnvironment(environment)],
    ['Duplicate', () => duplicateEnvironment(environment)],
    ['Export', [
      ['PostMeter', () => { void exportEnvironment(environment, 'postmeter'); }],
      ['Postman', () => { void exportEnvironment(environment, 'postman'); }]
    ]],
    ['Delete', () => deleteEnvironment(environment), 'danger']
  ]);
  return wrapper;
}

function renderWorkspaces() {
  const root = $('workspacesList');
  root.textContent = '';
  appendSidebarTreeRows(root, workspaceListItems().map(workspaceNode));
}

function renderRunners() {
  ensureWorkspaceRunners();
  const root = $('runnersList');
  root.textContent = '';
  if (!workspace.runners.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state runner-empty-sidebar';
    const message = document.createElement('div');
    message.textContent = 'No runners';
    empty.append(message);
    root.append(empty);
    return;
  }
  appendSidebarTreeRows(root, workspace.runners.map(runnerNode));
}

function runnerNode(runner) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node runner-node';
  const button = treeButton(runnerDisplayName(runner), activeMainPanel === 'runner' && runner.id === activeRunnerConfigId, 'RUN', {
    treeKind: 'runner',
    treeId: runner.id
  });
  appendSidebarTreeRow(wrapper, button, {
    kind: 'runner',
    id: runner.id
  });
  button.addEventListener('click', () => {
    selectRunnerItem(runner.id);
  });
  attachTreeContextMenu(button, [
    ['Rename', () => renameRunner(runner)],
    ['Duplicate', () => duplicateRunner(runner)],
    ['Export', () => { void exportRunnerDefinition(runner); }],
    ['Delete', () => { void deleteRunner(runner); }, 'danger']
  ]);
  return wrapper;
}

function ensureWorkspacePerformanceTests() {
  workspace ||= {};
  if (!Array.isArray(workspace.performanceTests)) {
    workspace.performanceTests = [];
    return workspace.performanceTests;
  }
  const tests = workspace.performanceTests.filter((test) => test && typeof test === 'object');
  workspace.performanceTests = tests.some(performanceTestNeedsNormalization)
    ? normalizeWorkspacePerformanceTests(tests, workspace)
    : tests;
  return workspace.performanceTests;
}

function performanceTestNeedsNormalization(test) {
  if (!test || typeof test !== 'object') {
    return true;
  }
  const request = test.request;
  const method = String(request?.method || '').toUpperCase();
  return !test.id
    || !test.type
    || !RENDERER_PERFORMANCE_TEST_TYPES.includes(String(test.type || ''))
    || !test.typeSettings
    || !test.config
    || !test.safetyLimits
    || !test.capturePolicy
    || !test.authRefresh
    || !test.csvVariables
    || !request
    || typeof request !== 'object'
    || !request.id
    || !METHODS.includes(method)
    || !Array.isArray(request.headers)
    || !Array.isArray(request.queryParams)
    || !Array.isArray(request.variables)
    || !BODY_TYPES.includes(request.bodyType || 'NONE')
    || !request.scripts
    || typeof request.scripts !== 'object'
    || !request.cookieJar
    || typeof request.cookieJar !== 'object'
    || !request.settings
    || typeof request.settings !== 'object'
    || !request.autoHeaders;
}

function renderPerformanceTests() {
  ensureWorkspacePerformanceTests();
  const root = $('performanceList');
  if (!root) {
    return;
  }
  root.textContent = '';
  if (!workspace.performanceTests.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state performance-empty-sidebar';
    empty.textContent = 'No performance tests';
    root.append(empty);
    return;
  }
  appendSidebarTreeRows(root, workspace.performanceTests.map(performanceTestNode));
}

function performanceTestNode(test) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node performance-node';
  const button = treeButton(performanceTestDisplayName(test), activeMainPanel === 'performance' && test.id === activePerformanceTestId, 'PERF', {
    treeKind: 'performance',
    treeId: test.id
  });
  appendSidebarTreeRow(wrapper, button, {
    kind: 'performance',
    id: test.id
  });
  button.addEventListener('click', () => {
    selectPerformanceTestItem(test.id);
  });
  attachTreeContextMenu(button, [
    ['Rename', () => renamePerformanceTest(test)],
    ['Duplicate', () => duplicatePerformanceTest(test)],
    ['Export', () => { void exportActivePerformanceTest(test); }],
    ['Delete', () => { void deletePerformanceTest(test); }, 'danger']
  ]);
  return wrapper;
}

function workspaceNode(workspaceItem) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node workspace-node';
  const button = treeButton(workspaceTreeLabel(workspaceItem), activeMainPanel === 'workspace' && workspaceItem.id === selectedWorkspaceId, 'WRK', {
    treeKind: 'workspace',
    treeId: workspaceItem.id
  });
  appendSidebarTreeRow(wrapper, button, {
    kind: 'workspace',
    id: workspaceItem.id
  });
  button.addEventListener('click', () => {
    selectWorkspaceItem(workspaceItem.id);
  });
  const menuItems = [
    ['View Details', () => { selectWorkspaceItem(workspaceItem.id); }],
    ['Rename', () => { renameWorkspace(workspaceItem.id); }],
    ['Duplicate', () => { void duplicateWorkspace(workspaceItem.id); }],
    ['Export', () => { void exportWorkspace(workspaceItem.id); }]
  ];
  if (workspaceItem.encrypted === true && workspaceItem.locked === true && workspaceItem.current === true) {
    menuItems.splice(1, 0, ['Unlock Workspace', () => { void unlockWorkspace(workspaceItem.id); }]);
  } else if (workspaceItem.encrypted === true && workspaceItem.locked !== true) {
    menuItems.splice(1, 0, ['Decrypt Workspace', () => { void removeWorkspaceEncryption(workspaceItem.id); }]);
    if (workspaceItem.current === true) {
      menuItems.splice(2, 0, ['Reset Key', () => { void resetWorkspaceEncryptionKey(workspaceItem.id); }]);
    }
  } else {
    menuItems.splice(1, 0, ['Encrypt Workspace', () => { void encryptWorkspace(workspaceItem.id); }]);
  }
  if (workspaceItem.current !== true) {
    menuItems.splice(1, 0, ['Switch to This Workspace', () => { void switchWorkspace(workspaceItem.id, { focus: 'workspace' }); }]);
  }
  if (workspaceItem.deletable !== false) {
    menuItems.push(['Delete', () => { void deleteWorkspace(workspaceItem.id); }, 'danger']);
  }
  attachTreeContextMenu(button, menuItems);
  return wrapper;
}

function workspaceTreeLabel(workspaceItem) {
  const name = workspaceDisplayName(workspaceItem);
  return workspaceItem?.current === true ? `${name} (Active)` : name;
}

function renderWorkspacePanel() {
  const workspaceItem = activeWorkspaceItem();
  const title = $('workspaceMainTitle');
  if (title.dataset.editing !== 'true') {
    title.textContent = workspaceItem ? workspaceDisplayName(workspaceItem) : 'Select a workspace';
    title.setAttribute('contenteditable', 'false');
    title.removeAttribute('role');
    title.classList.remove('is-editing');
  }
  title.tabIndex = workspaceItem ? 0 : -1;
  title.setAttribute('aria-disabled', workspaceItem ? 'false' : 'true');
  title.setAttribute('aria-label', 'Workspace name');
  const encrypted = workspaceItem?.encrypted === true;
  const locked = workspaceItem?.locked === true;
  const switchButton = $('switchWorkspacePanelButton');
  switchButton.textContent = workspaceItem?.current === true && encrypted && locked
    ? 'Unlock Workspace'
    : 'Switch to this Workspace';
  switchButton.disabled = !workspaceItem || (workspaceItem.current === true && !(encrypted && locked));
  $('deleteWorkspacePanelButton').disabled = !workspaceItem || workspaceListItems().length <= 1;
  $('exportWorkspacePanelButton').disabled = !workspaceItem;
  $('encryptWorkspacePanelButton').hidden = encrypted;
  $('encryptWorkspacePanelButton').disabled = !workspaceItem || locked;
  $('removeWorkspaceEncryptionPanelButton').hidden = !encrypted;
  $('removeWorkspaceEncryptionPanelButton').disabled = !workspaceItem || locked;
  $('resetWorkspaceEncryptionKeyPanelButton').hidden = !encrypted;
  $('resetWorkspaceEncryptionKeyPanelButton').disabled = !workspaceItem || locked || workspaceItem.current !== true;
  if ($('trustedScriptSendRequestInput')) {
    $('trustedScriptSendRequestInput').checked = workspace.settings?.sandbox?.trustedCapabilities?.sendRequest === true;
  }
  if ($('trustedScriptCookiesInput')) {
    $('trustedScriptCookiesInput').checked = workspace.settings?.sandbox?.trustedCapabilities?.cookies === true;
  }
  if ($('trustedScriptVaultInput')) {
    $('trustedScriptVaultInput').checked = workspace.settings?.sandbox?.trustedCapabilities?.vault === true;
  }
  renderDiagnosticsPrivacyPanel();
  renderVaultMetadataPanel();
  renderSandboxPackageCachePanel();
  renderSandboxFileBindingsPanel();
  const container = $('workspaceSummary');
  container.textContent = '';
  if (!workspaceItem) {
    return;
  }
  const summary = workspaceSummaryForItem(workspaceItem);
  const rows = [
    ['Name', workspaceDisplayName(workspaceItem)],
    ['Workspace File', workspaceItem.path || 'Default local workspace'],
    ['Current Workspace', workspaceItem.current === true ? 'Yes' : 'No'],
    ['Encryption', locked ? 'Encrypted, locked' : encrypted ? 'Encrypted, unlocked' : 'Not encrypted'],
    ['Saved Workspaces', String(workspaceListItems().length || 0)],
    ['Schema Version', String(summary.schemaVersion || '-')],
    ['Collections', String(summary.collections)],
    ['Folders', String(summary.folders)],
    ['Requests', String(summary.requests)],
    ['Environments', String(summary.environments)],
    ['Runners', String(summary.runners)],
    ['Cookies', String(summary.cookies)],
    ['History Entries', String(summary.historyEntries)]
  ];
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.className = 'workspace-summary-row';
    const labelElement = document.createElement('div');
    labelElement.className = 'workspace-summary-label';
    labelElement.textContent = label;
    const valueElement = document.createElement('div');
    valueElement.className = 'workspace-summary-value';
    valueElement.textContent = value;
    row.append(labelElement, valueElement);
    container.append(row);
  }
}

function renderCsvVariablesDropdown(prefix, csvVariables, enabledForTarget) {
  const trigger = $(`${prefix}CsvVariablesButton`);
  const toggle = $(`${prefix}ToggleCsvVariablesButton`);
  const edit = $(`${prefix}EditCsvVariablesButton`);
  const normalized = normalizeCsvVariableDataDefaultOff(csvVariables);
  const enabled = enabledForTarget && normalized.enabled !== false;
  const labelScope = prefix === 'runner' ? 'Runner' : 'Performance';
  if (trigger) {
    trigger.disabled = !enabledForTarget;
    trigger.textContent = `CSV Variables: ${enabled ? 'On' : 'Off'}`;
    trigger.classList.toggle('csv-variables-active', enabled);
    trigger.setAttribute('aria-label', `${labelScope} CSV variables ${enabled ? 'on' : 'off'}`);
  }
  if (toggle) {
    toggle.disabled = !enabledForTarget;
    toggle.textContent = enabled ? 'Turn Off' : 'Turn On';
  }
  if (edit) {
    edit.disabled = !enabledForTarget;
  }
}

function renderRunnerEditor() {
  const runner = activeRunner();
  const title = $('runnerMainTitle');
  if (title && title.dataset.editing !== 'true') {
    title.textContent = runner ? runnerDisplayName(runner) : 'Select a runner';
    title.setAttribute('contenteditable', 'false');
    title.removeAttribute('role');
    title.classList.remove('is-editing');
  }
  if (title) {
    title.tabIndex = runner ? 0 : -1;
    title.setAttribute('aria-disabled', runner ? 'false' : 'true');
    title.setAttribute('aria-label', 'Runner name');
  }
  $('saveRunnerButton').disabled = !runner;
  renderCsvVariablesDropdown('runner', runner?.csvVariables, Boolean(runner));
  $('deleteRunnerButton').disabled = !runner;
  $('runCollectionButton').disabled = !runner || activeRunnerId != null;
  $('cancelRunnerButton').disabled = !activeRunnerId;
  $('runnerStopOnFailure').checked = runner?.stopOnFailure === true;
  $('runnerStopOnFailure').disabled = !runner;
  $('runnerAllowEnvironmentMutation').checked = runner?.allowEnvironmentMutation === true;
  $('runnerAllowEnvironmentMutation').disabled = !runner;
  $('runnerAdvancedSettingsButton').disabled = !runner;
  if (!runner) {
    closeRunnerAdvancedSettingsPanel();
  }
  renderCapturePolicyControls('runner', runner?.capturePolicy, Boolean(runner));
  renderAuthRefreshControls('runner', runner?.authRefresh, Boolean(runner));
  $('addRunnerRequestButton').disabled = !runner;
  renderRunnerRequestList(runner);
  syncRunnerResultExportButtons(runner);
}

function setRunnerResultExportButtonsDisabled(disabled) {
  for (const id of ['exportRunnerResultsButton', 'exportRunnerHtmlButton', 'exportRunnerJsonButton', 'exportRunnerCsvButton']) {
    const button = $(id);
    if (button) {
      button.disabled = disabled;
    }
  }
}

function syncRunnerResultExportButtons(runner = activeRunner()) {
  setRunnerResultExportButtonsDisabled(!runner || !lastRunnerResult || Boolean(activeRunnerId));
}

function renderPerformanceEditor() {
  const test = activePerformanceTest();
  const title = $('performanceMainTitle');
  if (title && title.dataset.editing !== 'true') {
    title.textContent = test ? performanceTestDisplayName(test) : 'Select a performance test';
    title.setAttribute('contenteditable', 'false');
    title.removeAttribute('role');
    title.classList.remove('is-editing');
  }
  if (title) {
    title.tabIndex = test ? 0 : -1;
    title.setAttribute('aria-disabled', test ? 'false' : 'true');
    title.setAttribute('aria-label', 'Performance test name');
  }
  for (const id of ['performanceCsvVariablesButton', 'performanceToggleCsvVariablesButton', 'performanceEditCsvVariablesButton', 'savePerformanceTestButton', 'deletePerformanceTestButton', 'runPerformanceTestButton', 'importPerformanceRequestButton', 'performanceAdvancedSettingsButton']) {
    const button = $(id);
    if (button) {
      button.disabled = !test;
    }
  }
  renderCsvVariablesDropdown('performance', test?.csvVariables, Boolean(test));
  if ($('runPerformanceTestButton')) {
    $('runPerformanceTestButton').disabled = !test || Boolean(activePerformanceRunId);
  }
  const cancelButton = $('cancelPerformanceTestButton');
  if (cancelButton) {
    cancelButton.disabled = !activePerformanceRunId;
  }
  renderPerformanceTypeTabs(test);
  renderPerformanceConfigControls(test);
  renderPerformanceSafetyControls(test);
  renderPerformanceMutationControls(test);
  renderCapturePolicyControls('performance', test?.capturePolicy, Boolean(test));
  renderPerformanceRequestEditor(test);
  renderAuthRefreshControls('performance', test?.authRefresh, Boolean(test));
  if (!test) {
    closePerformanceAdvancedSettingsPanel();
  }
  syncPerformanceResultExportButtons(test);
}

function syncPerformanceResultExportButtons(test = activePerformanceTest()) {
  for (const id of ['exportPerformanceResultsButton', 'exportPerformanceResultHtmlButton', 'exportPerformanceResultJsonButton', 'exportPerformanceResultCsvButton']) {
    const button = $(id);
    if (button) {
      button.disabled = !test || !isActivePerformanceResultForTest(test) || Boolean(activePerformanceRunId);
    }
  }
}

function renderPerformanceRequestEditor(test = activePerformanceTest()) {
  const request = test?.request || null;
  setPerformanceRequestSectionDisabled(!test);
  renderRequestEditorForContext('performance', request, {
    applyRefreshingCookieState: () => applyPerformanceRefreshingCookieState(test)
  });
}

function setPerformanceRequestSectionDisabled(disabled) {
  for (const control of document.querySelectorAll('#performanceRequestSection input, #performanceRequestSection select, #performanceRequestSection textarea, #performanceRequestSection button')) {
    control.disabled = disabled;
  }
  for (const button of document.querySelectorAll('.tab[data-tab-group="performanceRequest"]')) {
    button.disabled = disabled;
  }
  const runButton = $('runPerformanceTestButton');
  if (runButton) {
    runButton.disabled = disabled || Boolean(activePerformanceRunId);
  }
  const cancelButton = $('cancelPerformanceTestButton');
  if (cancelButton) {
    cancelButton.disabled = !activePerformanceRunId;
  }
}

function renderPerformancePairs(containerId, pairs) {
  renderRequestPairsForContext('performance', containerId, pairs, containerId === 'performanceParamsTable' ? 'queryParams' : '');
}

function renderPerformanceHeaderPairs(containerId, request) {
  renderRequestHeaderPairsForContext('performance', containerId, request);
}

function renderPerformanceRequestVariablePairs(pairs) {
  renderRequestVariablePairsForContext('performance', pairs);
}

function renderPerformanceVariablePreview() {
  const test = activePerformanceTest();
  renderEditorVariablePreview({
    doc: document,
    containerId: 'performanceVariablePreview',
    collection: null,
    environment: performanceSelectedEnvironment(test),
    request: test?.request || null
  });
}

function renderPerformanceAuthEditor(auth) {
  syncPerformanceAutoRefreshAuthTypeOption(auth);
  renderRequestAuthEditor(auth, {
    doc: document,
    idPrefix: 'performance',
    showAuthSection: showPerformanceAuthSection
  });
  syncPerformanceAutoRefreshAuthTypeOption(auth);
}

function showPerformanceAuthSection(type) {
  for (const section of document.querySelectorAll('#performanceAuthTab .auth-section')) {
    section.classList.toggle('active', section.dataset.authSection === type);
  }
  syncPerformanceAutoRefreshAuthTypeOption({ type });
}

function renderPerformanceCookieJarEditor() {
  renderRequestCookieJarEditor({
    doc: document,
    workspace,
    filterInputId: 'performanceFilterCookiesToRequestHostInput',
    activeRequestUrl: activePerformanceTest()?.request?.url || '',
    managedCookieNames: performanceManagedRefreshingCookieNames(),
    onDirty: markCookieJarDirty,
    rerender: renderPerformanceCookieJarEditor,
    setStatus
  });
}

function setManagedCookieJarToggleState(prefix, managed) {
  const enabledInput = prefix
    ? $(`${prefix}RequestCookieJarEnabledInput`)
    : $('requestCookieJarEnabledInput');
  const storeInput = prefix
    ? $(`${prefix}RequestCookieJarStoreInput`)
    : $('requestCookieJarStoreInput');
  for (const input of [enabledInput, storeInput]) {
    if (!input) {
      continue;
    }
    input.disabled = managed === true;
    input.title = managed === true
      ? 'Refreshing Auth manages the cookie jar for this request.'
      : (input.closest('label')?.getAttribute('title') || '');
  }
}

function performanceSelectedEnvironment(test = activePerformanceTest()) {
  return activeEnvironment();
}

function renderPerformanceTypeTabs(test) {
  const type = RENDERER_PERFORMANCE_TEST_TYPES.includes(test?.type) ? test.type : 'diagnosis';
  const select = $('performanceTypeSelect');
  if (select) {
    select.value = type;
    if (select.value !== type) {
      select.value = 'diagnosis';
    }
    select.disabled = !test;
    fitPerformanceTypeSelectToOptions(select);
  }
  for (const button of document.querySelectorAll('.tab[data-tab-group="performance"]')) {
    const isActive = button.dataset.tab === type;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    button.tabIndex = isActive ? 0 : -1;
    button.disabled = !test;
  }
  for (const panelId of TAB_PANEL_IDS.performance) {
    const panel = $(panelId);
    if (!panel) {
      continue;
    }
    const isActive = panel.id === `${type}Tab`;
    panel.classList.toggle('active', isActive);
    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  }
}

function fitPerformanceTypeSelectToOptions(select = $('performanceTypeSelect')) {
  if (!select || !select.options?.length || typeof document === 'undefined' || typeof getComputedStyle !== 'function') {
    return;
  }
  const style = getComputedStyle(select);
  const canvas = fitPerformanceTypeSelectToOptions.canvas ||= document.createElement('canvas');
  let context = null;
  try {
    context = canvas.getContext('2d');
  } catch {
    context = null;
  }
  if (!context) {
    return;
  }
  context.font = style.font || `${style.fontSize} ${style.fontFamily}`;
  const longestOptionWidth = Array.from(select.options)
    .reduce((max, option) => Math.max(max, context.measureText(option.textContent.trim()).width), 0);
  const horizontalPadding = cssPixelValue(style.paddingLeft) + cssPixelValue(style.paddingRight);
  const horizontalBorder = cssPixelValue(style.borderLeftWidth) + cssPixelValue(style.borderRightWidth);
  const arrowAllowance = Math.max(28, cssPixelValue(style.fontSize) * 1.35);
  const width = Math.ceil(longestOptionWidth + horizontalPadding + horizontalBorder + arrowAllowance);
  select.closest('.performance-type-select-field')?.style.setProperty('--performance-type-select-width', `${width}px`);
}

function cssPixelValue(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

function renderPerformanceConfigControls(test) {
  for (const panel of document.querySelectorAll('.performance-type-panel')) {
    const type = performanceTypeForElement(panel);
    const config = performanceTypeSettings(test, type).config || {};
    setPerformancePanelControlValue(panel, 'config', 'iterations', config.iterations || 1);
    setPerformancePanelControlValue(panel, 'config', 'startConcurrency', config.startConcurrency || 1);
    setPerformancePanelControlValue(panel, 'config', 'concurrency', config.concurrency || 1);
    setPerformancePanelControlValue(panel, 'config', 'durationSeconds', config.durationSeconds || 0);
    setPerformancePanelControlValue(panel, 'config', 'rampSteps', config.rampSteps || 1);
    setPerformancePanelControlValue(panel, 'config', 'spikeMultiplier', config.spikeMultiplier || 1);
    setPerformancePanelControlValue(panel, 'config', 'diagnosisScope', normalizeDiagnosisScope(config.diagnosisScope));
  }
  setPerformanceControlsDisabled('config', !test);
}

function renderPerformanceSafetyControls(test) {
  for (const panel of document.querySelectorAll('.performance-type-panel')) {
    const type = performanceTypeForElement(panel);
    const safetyLimits = performanceTypeSettings(test, type).safetyLimits || {};
    setPerformancePanelControlValue(panel, 'safety', 'maxTotalRequests', safetyLimits.maxTotalRequests || 100);
    setPerformancePanelControlValue(panel, 'safety', 'maxConcurrency', safetyLimits.maxConcurrency || 10);
    setPerformancePanelControlValue(panel, 'safety', 'maxDurationSeconds', safetyLimits.maxDurationSeconds || 60);
  }
  setPerformanceControlsDisabled('safety', !test);
}

function renderPerformanceMutationControls(test) {
  const activeType = RENDERER_PERFORMANCE_TEST_TYPES.includes(test?.type) ? test.type : 'diagnosis';
  for (const input of document.querySelectorAll('[data-performance-mutation]')) {
    const type = performanceTypeForElement(input) || activeType;
    input.checked = performanceTypeSettings(test, type).allowEnvironmentMutation === true;
    input.disabled = !test;
  }
}

function setActivePerformanceTypeFromControl() {
  const test = activePerformanceTest();
  if (!test) {
    return;
  }
  const previousType = RENDERER_PERFORMANCE_TEST_TYPES.includes(test.type) ? test.type : 'diagnosis';
  collectPerformanceTypeSettingsFromPanel(test, previousType, $(`${previousType}Tab`) || activePerformanceTypePanel());
  const nextType = RENDERER_PERFORMANCE_TEST_TYPES.includes($('performanceTypeSelect')?.value)
    ? $('performanceTypeSelect').value
    : 'diagnosis';
  const changed = test.type !== nextType;
  test.type = nextType;
  syncPerformanceActiveTypeSettings(test);
  renderPerformanceTypeTabs(test);
  renderPerformanceConfigControls(test);
  renderPerformanceSafetyControls(test);
  renderPerformanceMutationControls(test);
  renderCapturePolicyControls('performance', test.capturePolicy, true);
  if (changed) {
    markActivePerformanceDirty();
  }
  refreshVariableHighlights();
  scheduleSessionSave();
}

function capturePolicyKind(prefix) {
  return prefix === 'performance' ? 'performance' : 'runner';
}

function capturePolicyContext(prefix) {
  const kind = capturePolicyKind(prefix);
  if (kind === 'performance') {
    const type = activePerformanceType() || activePerformanceTest()?.type || 'diagnosis';
    return {
      diagnostic: type === 'diagnosis',
      plannedRequests: activePerformancePlannedRequestCount(type)
    };
  }
  return {
    diagnostic: false,
    plannedRequests: activeRunnerPlannedRequestCount()
  };
}

function activeRunnerPlannedRequestCount(runner = activeRunner()) {
  if (!runner) {
    return 0;
  }
  const requestList = $('runnerRequestList');
  const rows = Array.from(requestList?.querySelectorAll('.runner-request-row[data-runner-request-index]') || []);
  if (rows.length) {
    const covered = new Set();
    let total = 0;
    for (const row of rows) {
      const index = Number.parseInt(row.dataset.runnerRequestIndex || '', 10);
      if (!Number.isInteger(index) || index < 0 || !runner.requests?.[index]) {
        continue;
      }
      covered.add(index);
      total += normalizeRunnerRequestIterations(row.querySelector('.runner-row-iterations input')?.value);
    }
    for (let index = 0; index < (runner.requests || []).length; index += 1) {
      if (!covered.has(index)) {
        total += normalizeRunnerRequestIterations(runner.requests[index]?.iterations);
      }
    }
    return total;
  }
  return normalizeRunnerRequests(runner.requests || [])
    .reduce((total, request) => total + normalizeRunnerRequestIterations(request.iterations), 0);
}

function activePerformancePlannedRequestCount(type = activePerformanceType()) {
  const test = activePerformanceTest();
  if (!test) {
    return 0;
  }
  const effectiveType = RENDERER_PERFORMANCE_TEST_TYPES.includes(type) ? type : test.type || 'diagnosis';
  const settings = performanceTypeSettings(test, effectiveType);
  return performancePlannedRequestCount(effectiveType, settings.config || {}, settings.safetyLimits || {});
}

function capturePolicyGuardrailState(prefix, policy) {
  const kind = capturePolicyKind(prefix);
  const context = capturePolicyContext(prefix);
  const preferred = normalizeResultCapturePolicy(policy || {}, kind, { diagnostic: context.diagnostic });
  const effective = normalizeResultCapturePolicy(policy || {}, kind, context);
  const plannedRequests = Math.max(0, Number(context.plannedRequests || 0));
  const highVolume = plannedRequests >= RESULT_CAPTURE_HIGH_VOLUME_REQUESTS;
  const veryHighVolume = plannedRequests >= RESULT_CAPTURE_VERY_HIGH_VOLUME_REQUESTS;
  return {
    kind,
    context,
    preferred,
    effective,
    highVolume,
    veryHighVolume,
    preRequestForcedOff: veryHighVolume,
    postRequestForcedOff: veryHighVolume,
    scriptLogsForcedOff: highVolume,
    localVariablesForcedOff: highVolume,
    responseHeadersForcedOff: veryHighVolume && !(kind === 'performance' && context.diagnostic === true),
    transportTimingsForcedOff: veryHighVolume && kind !== 'performance',
    responseBodyLimitedModes: veryHighVolume ? ['all', 'sampled'] : highVolume ? ['all'] : [],
    bodyPreviewCap: veryHighVolume ? 2048 : highVolume ? 4096 : 32768
  };
}

function formatRequestCount(value) {
  const number = Math.max(0, Number(value || 0));
  return Number.isFinite(number) ? Math.round(number).toLocaleString('en-US') : '0';
}

function captureGuardrailTooltip(state, label) {
  const threshold = state.veryHighVolume ? RESULT_CAPTURE_VERY_HIGH_VOLUME_REQUESTS : RESULT_CAPTURE_HIGH_VOLUME_REQUESTS;
  return `${label} is disabled for this high-volume run (${formatRequestCount(state.context.plannedRequests)} planned requests). PostMeter turns off heavy per-request captures at ${formatRequestCount(threshold)}+ requests to keep the temporary result database usable. Reduce the planned request count below ${formatRequestCount(threshold)} to re-enable it.`;
}

function setCaptureGuardrailTitle(element, title, className = 'capture-guardrail-disabled') {
  if (!element) {
    return;
  }
  const label = element.closest('label');
  element.title = title || '';
  if (label) {
    label.title = title || '';
    label.classList.toggle(className, Boolean(title));
  }
}

function resetCaptureGuardrailState(element) {
  if (!element) {
    return;
  }
  setCaptureGuardrailTitle(element, '');
  const label = element.closest('label');
  label?.classList.remove('capture-guardrail-limited');
}

function applyResponseBodyOptionGuardrails(select, state) {
  if (!select) {
    return;
  }
  const limitedModes = new Set(state.responseBodyLimitedModes);
  for (const option of select.options || []) {
    const limited = limitedModes.has(option.value);
    option.disabled = limited;
    option.title = limited ? captureGuardrailTooltip(state, `${option.textContent || option.value} response body capture`) : '';
  }
  if (limitedModes.size) {
    const title = captureGuardrailTooltip(state, 'Full response body capture');
    setCaptureGuardrailTitle(select, title, 'capture-guardrail-limited');
  }
}

function closeCaptureSettingsPanels(options = {}) {
  const exceptPanel = options.exceptPanel || null;
  for (const panel of document.querySelectorAll('.capture-settings-panel')) {
    if (panel === exceptPanel) {
      continue;
    }
    panel.hidden = true;
    panel.style.left = '';
    panel.style.top = '';
    panel.style.maxHeight = '';
    panel.style.overflowY = '';
    const button = panel.id ? document.querySelector(`[aria-controls="${cssEscapeAttributeValue(panel.id)}"]`) : null;
    button?.setAttribute('aria-expanded', 'false');
  }
}

function bindCaptureSettingsDropdownDismissal() {
  const onDocumentClick = (event) => {
    if (event.target?.closest?.('.capture-settings-menu-group')) {
      return;
    }
    if (isTutorialCoachInteraction(event.target)) {
      return;
    }
    if (isAuthRefreshAutoDetectModalInteraction(event.target)) {
      return;
    }
    closeCaptureSettingsPanels();
  };
  const onKeyDown = (event) => {
    if (event.key !== 'Escape') {
      return;
    }
    const activePanel = event.target?.closest?.('.capture-settings-panel');
    closeCaptureSettingsPanels();
    if (activePanel?.id) {
      document.querySelector(`[aria-controls="${cssEscapeAttributeValue(activePanel.id)}"]`)?.focus?.();
    }
  };
  const closeAll = () => closeCaptureSettingsPanels();
  const onScroll = (event) => {
    if (isAuthRefreshAutoDetectModalOpen()) {
      return;
    }
    if (event.target?.closest?.('.capture-settings-panel')) {
      return;
    }
    closeAll();
  };
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('blur', closeAll);
  window.addEventListener('resize', closeAll);
  return () => {
    document.removeEventListener('click', onDocumentClick);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('blur', closeAll);
    window.removeEventListener('resize', closeAll);
  };
}

function isAuthRefreshAutoDetectModalInteraction(target) {
  if (target?.closest?.('#authRefreshAutoDetectModal')) {
    return true;
  }
  if (!isAuthRefreshAutoDetectModalOpen()) {
    return false;
  }
  const backdrop = $('modalBackdrop');
  return Boolean(backdrop && (target === backdrop || backdrop.contains?.(target)));
}

function isTutorialCoachInteraction(target) {
  return Boolean(activeTutorial() && target?.closest?.('#tutorialCoach'));
}

function isAuthRefreshAutoDetectModalOpen() {
  const modal = $('authRefreshAutoDetectModal');
  return modal?.hidden === false;
}

function renderCapturePolicyControls(prefix, policy, enabled) {
  const state = capturePolicyGuardrailState(prefix, policy);
  const normalized = state.effective;
  const setControl = (suffix, value, property = 'value', options = {}) => {
    const element = $(`${prefix}Capture${suffix}`);
    if (!element) {
      return;
    }
    resetCaptureGuardrailState(element);
    element[property] = value;
    element.disabled = !enabled || options.disabled === true;
    if (options.title) {
      setCaptureGuardrailTitle(element, options.title);
    }
  };
  setControl('ResponseBodySelect', normalized.responseBody || 'all');
  setControl('BodyPreviewBytesInput', String(normalized.bodyPreviewBytes ?? 32768));
  setControl('PreRequestInput', normalized.preRequestOutput === true, 'checked', {
    disabled: state.preRequestForcedOff,
    title: state.preRequestForcedOff ? captureGuardrailTooltip(state, 'Pre-request output') : ''
  });
  setControl('PostRequestInput', normalized.postRequestOutput === true, 'checked', {
    disabled: state.postRequestForcedOff,
    title: state.postRequestForcedOff ? captureGuardrailTooltip(state, 'Post-request output') : ''
  });
  setControl('ScriptLogsInput', normalized.scriptLogs === true, 'checked', {
    disabled: state.scriptLogsForcedOff,
    title: state.scriptLogsForcedOff ? captureGuardrailTooltip(state, 'Script logs') : ''
  });
  setControl('LocalVariablesInput', normalized.localVariables === true, 'checked', {
    disabled: state.localVariablesForcedOff,
    title: state.localVariablesForcedOff ? captureGuardrailTooltip(state, 'Local variables') : ''
  });
  setControl('HeadersInput', normalized.responseHeaders === true, 'checked', {
    disabled: state.responseHeadersForcedOff,
    title: state.responseHeadersForcedOff ? captureGuardrailTooltip(state, 'Response headers') : ''
  });
  setControl('TimingsInput', normalized.transportTimings === true, 'checked', {
    disabled: state.transportTimingsForcedOff,
    title: state.transportTimingsForcedOff ? captureGuardrailTooltip(state, 'Transport timings') : ''
  });
  const bodyPreviewInput = $(`${prefix}CaptureBodyPreviewBytesInput`);
  if (bodyPreviewInput) {
    bodyPreviewInput.max = String(state.bodyPreviewCap);
    if (state.highVolume) {
      setCaptureGuardrailTitle(
        bodyPreviewInput,
        `Preview bytes are capped at ${formatRequestCount(state.bodyPreviewCap)} for this high-volume run (${formatRequestCount(state.context.plannedRequests)} planned requests).`,
        'capture-guardrail-limited'
      );
    }
  }
  applyResponseBodyOptionGuardrails($(`${prefix}CaptureResponseBodySelect`), state);
  const button = $(`${prefix}CaptureSettingsButton`);
  if (button) {
    button.disabled = !enabled;
  }
  if (!enabled) {
    closeCaptureSettingsPanel(prefix);
  }
}

function collectCapturePolicyFromControls(prefix, fallback = {}) {
  const state = capturePolicyGuardrailState(prefix, fallback);
  const responseBodySelect = $(`${prefix}CaptureResponseBodySelect`);
  const bodyPreviewInput = $(`${prefix}CaptureBodyPreviewBytesInput`);
  const next = {
    ...fallback,
    responseBody: responseBodySelect?.value || fallback.responseBody,
    bodyPreviewBytes: bodyPreviewInput?.value || fallback.bodyPreviewBytes,
    preRequestOutput: $(`${prefix}CapturePreRequestInput`)?.checked === true,
    postRequestOutput: $(`${prefix}CapturePostRequestInput`)?.checked === true,
    scriptLogs: $(`${prefix}CaptureScriptLogsInput`)?.checked === true,
    localVariables: $(`${prefix}CaptureLocalVariablesInput`)?.checked === true,
    responseHeaders: $(`${prefix}CaptureHeadersInput`)?.checked ?? fallback.responseHeaders,
    transportTimings: $(`${prefix}CaptureTimingsInput`)?.checked ?? fallback.transportTimings
  };
  if (state.preRequestForcedOff) {
    next.preRequestOutput = state.preferred.preRequestOutput === true;
  }
  if (state.postRequestForcedOff) {
    next.postRequestOutput = state.preferred.postRequestOutput === true;
  }
  if (state.scriptLogsForcedOff) {
    next.scriptLogs = state.preferred.scriptLogs === true;
  }
  if (state.localVariablesForcedOff) {
    next.localVariables = state.preferred.localVariables === true;
  }
  if (state.responseHeadersForcedOff) {
    next.responseHeaders = state.preferred.responseHeaders === true;
  }
  if (state.transportTimingsForcedOff) {
    next.transportTimings = state.preferred.transportTimings === true;
  }
  if (state.highVolume && Number(state.preferred.bodyPreviewBytes || 0) > state.bodyPreviewCap && bodyPreviewInput?.value === String(state.effective.bodyPreviewBytes)) {
    next.bodyPreviewBytes = state.preferred.bodyPreviewBytes;
  }
  if (state.responseBodyLimitedModes.includes(state.preferred.responseBody)
    && responseBodySelect?.value === state.effective.responseBody) {
    next.responseBody = state.preferred.responseBody;
  }
  return normalizeResultCapturePolicy(next, state.kind, { diagnostic: state.context.diagnostic });
}

function closeCaptureSettingsPanel(prefix) {
  const panel = $(`${prefix}CaptureSettingsPanel`);
  const button = $(`${prefix}CaptureSettingsButton`);
  if (!panel || !button) {
    return;
  }
  panel.hidden = true;
  panel.style.left = '';
  panel.style.top = '';
  panel.style.maxHeight = '';
  panel.style.overflowY = '';
  button.setAttribute('aria-expanded', 'false');
}

function closeRunnerAdvancedSettingsPanel() {
  const panel = $('runnerAdvancedSettingsPanel');
  const button = $('runnerAdvancedSettingsButton');
  if (!panel || !button) {
    return;
  }
  panel.hidden = true;
  panel.style.left = '';
  panel.style.top = '';
  button.setAttribute('aria-expanded', 'false');
}

function positionRunnerAdvancedSettingsPanel() {
  const panel = $('runnerAdvancedSettingsPanel');
  const button = $('runnerAdvancedSettingsButton');
  if (!panel || !button || panel.hidden) {
    return;
  }
  const margin = 12;
  const gap = 6;
  const buttonRect = button.getBoundingClientRect();
  const viewportWidth = Number(window.innerWidth) || document.documentElement?.clientWidth || 1024;
  const viewportHeight = Number(window.innerHeight) || document.documentElement?.clientHeight || 768;
  const panelWidth = Math.min(panel.offsetWidth || 320, Math.max(0, viewportWidth - margin * 2));
  const panelHeight = Math.min(panel.offsetHeight || 0, Math.max(0, viewportHeight - margin * 2));
  const maxLeft = Math.max(margin, viewportWidth - panelWidth - margin);
  const left = Math.min(Math.max(margin, buttonRect.left), maxLeft);
  const preferredTop = buttonRect.bottom + gap;
  const maxTop = Math.max(margin, viewportHeight - panelHeight - margin);
  const top = Math.min(Math.max(margin, preferredTop), maxTop);
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

function toggleRunnerAdvancedSettingsPanel(event) {
  event?.stopPropagation?.();
  const panel = $('runnerAdvancedSettingsPanel');
  const button = $('runnerAdvancedSettingsButton');
  if (!panel || !button || button.disabled) {
    return;
  }
  const shouldOpen = panel.hidden !== false;
  closeToolbarMenus();
  closeContextMenu();
  closeFileSourceMenu();
  closeCaptureSettingsPanels({ exceptPanel: shouldOpen ? panel : null });
  panel.hidden = !shouldOpen;
  button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  if (shouldOpen) {
    positionRunnerAdvancedSettingsPanel();
    panel.querySelector('input, select, button, textarea')?.focus?.();
  }
}

function closePerformanceAdvancedSettingsPanel() {
  const panel = $('performanceAdvancedSettingsPanel');
  const button = $('performanceAdvancedSettingsButton');
  if (!panel || !button) {
    return;
  }
  panel.hidden = true;
  panel.style.left = '';
  panel.style.top = '';
  button.setAttribute('aria-expanded', 'false');
}

function positionPerformanceAdvancedSettingsPanel() {
  const panel = $('performanceAdvancedSettingsPanel');
  const button = $('performanceAdvancedSettingsButton');
  if (!panel || !button || panel.hidden) {
    return;
  }
  const margin = 12;
  const gap = 6;
  const buttonRect = button.getBoundingClientRect();
  const viewportWidth = Number(window.innerWidth) || document.documentElement?.clientWidth || 1024;
  const viewportHeight = Number(window.innerHeight) || document.documentElement?.clientHeight || 768;
  const panelWidth = Math.min(panel.offsetWidth || 320, Math.max(0, viewportWidth - margin * 2));
  const panelHeight = Math.min(panel.offsetHeight || 0, Math.max(0, viewportHeight - margin * 2));
  const maxLeft = Math.max(margin, viewportWidth - panelWidth - margin);
  const left = Math.min(Math.max(margin, buttonRect.left), maxLeft);
  const preferredTop = buttonRect.bottom + gap;
  const maxTop = Math.max(margin, viewportHeight - panelHeight - margin);
  const top = Math.min(Math.max(margin, preferredTop), maxTop);
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

function togglePerformanceAdvancedSettingsPanel(event) {
  event?.stopPropagation?.();
  const panel = $('performanceAdvancedSettingsPanel');
  const button = $('performanceAdvancedSettingsButton');
  if (!panel || !button || button.disabled) {
    return;
  }
  const shouldOpen = panel.hidden !== false;
  closeToolbarMenus();
  closeContextMenu();
  closeFileSourceMenu();
  closeCaptureSettingsPanels({ exceptPanel: shouldOpen ? panel : null });
  panel.hidden = !shouldOpen;
  button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  if (shouldOpen) {
    positionPerformanceAdvancedSettingsPanel();
    panel.querySelector('input, select, button, textarea')?.focus?.();
  }
}

function positionCaptureSettingsPanel(prefix) {
  const panel = $(`${prefix}CaptureSettingsPanel`);
  const button = $(`${prefix}CaptureSettingsButton`);
  if (!panel || !button || panel.hidden) {
    return;
  }
  const margin = 12;
  const gap = 6;
  const buttonRect = button.getBoundingClientRect();
  const viewportWidth = Number(window.innerWidth) || document.documentElement?.clientWidth || 1024;
  const viewportHeight = Number(window.innerHeight) || document.documentElement?.clientHeight || 768;
  const panelWidth = Math.min(panel.offsetWidth || 360, Math.max(0, viewportWidth - margin * 2));
  const panelHeight = Math.min(panel.offsetHeight || 0, Math.max(0, viewportHeight - margin * 2));
  const maxLeft = Math.max(margin, viewportWidth - panelWidth - margin);
  const preferredLeft = prefix === 'runner' ? buttonRect.left : buttonRect.right - panelWidth;
  const left = Math.min(Math.max(margin, preferredLeft), maxLeft);
  const preferredTop = buttonRect.bottom + gap;
  const maxTop = Math.max(margin, viewportHeight - panelHeight - margin);
  const top = Math.min(Math.max(margin, preferredTop), maxTop);
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

function toggleCaptureSettingsPanel(prefix, event) {
  event?.stopPropagation?.();
  const panel = $(`${prefix}CaptureSettingsPanel`);
  const button = $(`${prefix}CaptureSettingsButton`);
  if (!panel || !button || button.disabled) {
    return;
  }
  const shouldOpen = panel.hidden !== false;
  closeToolbarMenus();
  closeContextMenu();
  closeFileSourceMenu();
  closeCaptureSettingsPanels({ exceptPanel: shouldOpen ? panel : null });
  panel.hidden = !shouldOpen;
  button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  if (shouldOpen) {
    positionCaptureSettingsPanel(prefix);
    panel.querySelector('select, input, button, textarea')?.focus?.();
  }
}

function positionAuthRefreshPanel(prefix) {
  const panel = $(`${prefix}AuthRefreshPanel`);
  const button = $(`${prefix}AuthRefreshButton`);
  if (!panel || !button || panel.hidden) {
    return;
  }
  const margin = 12;
  const gap = 6;
  const buttonRect = button.getBoundingClientRect();
  const viewportWidth = Number(window.innerWidth) || document.documentElement?.clientWidth || 1024;
  const viewportHeight = Number(window.innerHeight) || document.documentElement?.clientHeight || 768;
  panel.style.maxHeight = `${Math.max(160, viewportHeight - margin * 2)}px`;
  panel.style.overflowY = 'auto';
  const panelWidth = Math.min(panel.offsetWidth || 640, Math.max(0, viewportWidth - margin * 2));
  const panelHeight = Math.min(panel.scrollHeight || panel.offsetHeight || 0, Math.max(0, viewportHeight - margin * 2));
  const maxLeft = Math.max(margin, viewportWidth - panelWidth - margin);
  const left = Math.min(Math.max(margin, buttonRect.right - panelWidth), maxLeft);
  const preferredTop = buttonRect.bottom + gap;
  const maxTop = Math.max(margin, viewportHeight - panelHeight - margin);
  const top = Math.min(Math.max(margin, preferredTop), maxTop);
  const availableHeight = Math.max(160, viewportHeight - top - margin);
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  panel.style.maxHeight = `${availableHeight}px`;
}

function toggleAuthRefreshPanel(prefix, event) {
  event?.stopPropagation?.();
  const panel = $(`${prefix}AuthRefreshPanel`);
  const button = $(`${prefix}AuthRefreshButton`);
  if (!panel || !button || button.disabled) {
    return;
  }
  const shouldOpen = panel.hidden !== false;
  closeToolbarMenus();
  closeContextMenu();
  closeFileSourceMenu();
  closeCaptureSettingsPanels({ exceptPanel: shouldOpen ? panel : null });
  panel.hidden = !shouldOpen;
  button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  if (shouldOpen) {
    positionAuthRefreshPanel(prefix);
    panel.querySelector('select, input, button, textarea')?.focus?.();
  }
}
