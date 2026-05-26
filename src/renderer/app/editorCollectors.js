function collectRequestFieldsFromEditorContext(contextOrScope, request, options = {}) {
  const context = typeof contextOrScope === 'string' ? requestEditorContext(contextOrScope) : contextOrScope;
  if (!request) {
    return;
  }
  const method = String($(context.methodSelectId)?.value || '').toUpperCase();
  request.method = METHODS.includes(method) ? method : 'GET';
  request.url = $(context.urlInputId)?.value.trim() || '';
  syncRequestBodyFieldsFromEditor(context.bodyPrefix, request);
  request.auth = options.auth || collectRequestAuthFromEditorForContext(context);
  if (typeof options.afterAuth === 'function') {
    options.afterAuth(request);
  }
  request.scripts = {
    preRequest: $(context.preRequestScriptInputId)?.value || '',
    tests: $(context.testScriptInputId)?.value || ''
  };
  if (options.collectDocs === true || context.scope === 'performance') {
    request.docs = $(context.docsInputId)?.value || '';
  }
  request.cookieJar = {
    enabled: $(context.cookieJarEnabledInputId)?.checked === true,
    storeResponses: $(context.cookieJarStoreInputId)?.checked !== false
  };
  if (typeof options.applyRefreshingCookieState === 'function') {
    options.applyRefreshingCookieState(request);
  }
  request.autoHeaders = {
    sendPostMeterToken: $(context.autoHeaderTokenInputId)?.checked === true,
    showGeneratedHeaders: $(context.autoHeaderShowInputId)?.checked === true
  };
  request.settings = requestTlsSettingsFromInputs(request.settings, context.scope);
  request.queryParams = collectKeyValueRowsFromTable(context.paramsTableId, request.queryParams);
  request.headers = collectKeyValueRowsFromTable(context.headersTableId, request.headers);
}

function collectRequestAuthFromEditorForContext(contextOrScope) {
  const context = typeof contextOrScope === 'string' ? requestEditorContext(contextOrScope) : contextOrScope;
  return context.scope === 'performance' ? collectPerformanceAuthFromEditor() : collectAuthFromEditor();
}

function collectRequestFromEditor() {
  const request = activeRequest();
  if (!request) {
    return;
  }
  collectRequestNameFromTitle({ render: false });
  collectRequestFieldsFromEditorContext('request', request, {
    afterAuth: () => {
      if (activeRequestUsesRefreshingAuthCookie(request)) {
        request.auth = { type: 'none' };
      }
    },
    applyRefreshingCookieState: () => applyActiveRequestRefreshingCookieState(request)
  });
}

function setActiveRequestTlsSettingsFromInputs(event = null) {
  setActiveRequestTlsSettingsFromInputsForContext('request', event);
}

function setActivePerformanceRequestTlsSettingsFromInputs(event = null) {
  setActiveRequestTlsSettingsFromInputsForContext('performance', event);
}

function setActiveRequestTlsSettingsFromInputsForContext(contextOrScope, event = null) {
  const context = typeof contextOrScope === 'string' ? requestEditorContext(contextOrScope) : contextOrScope;
  const request = activeRequestForEditorContext(context);
  if (!request) {
    return;
  }
  setRequestTlsSettingsFromInput(request, event?.currentTarget?.id || context.scope);
  markRequestEditorContextDirty(context);
}

function setRequestTlsSettingsFromInput(request, inputId) {
  const scope = requestSettingsScopeFromInputId(inputId);
  const ids = requestSettingsControlIds(scope);
  const verification = $(ids.sslCertificateVerification);
  request.settings = requestTlsSettingsFromInputs(request.settings, inputId);
  if (verification) {
    verification.dataset.verificationValue = request.settings.sslCertificateVerification;
  }
  const inheritActions = $(ids.sslCertificateVerificationInheritActions);
  if (inheritActions) {
    inheritActions.hidden = request.settings.sslCertificateVerification !== 'inherit';
  }
}

function requestTlsSettingsFromInputs(existingSettings = {}, inputId = '') {
  const existing = normalizeRendererRequestTlsSettings(existingSettings);
  const scope = requestSettingsScopeFromInputId(inputId);
  const ids = requestSettingsControlIds(scope);
  const verification = $(ids.sslCertificateVerification);
  const verificationValue = verification?.value
    || verification?.dataset?.verificationValue
    || existing.sslCertificateVerification;
  const sslCertificateVerification = verification
    ? normalizeRendererRequestSslVerification(verificationValue)
    : existing.sslCertificateVerification;
  return {
    sslCertificateVerification,
    httpVersion: normalizeRendererHttpVersion($(ids.httpVersion)?.value || existing.httpVersion),
    followRedirects: $(ids.followRedirects) ? $(ids.followRedirects).checked === true : existing.followRedirects,
    followOriginalHttpMethod: $(ids.followOriginalHttpMethod) ? $(ids.followOriginalHttpMethod).checked === true : existing.followOriginalHttpMethod,
    followAuthorizationHeader: $(ids.followAuthorizationHeader) ? $(ids.followAuthorizationHeader).checked === true : existing.followAuthorizationHeader,
    removeRefererHeaderOnRedirect: $(ids.removeRefererHeaderOnRedirect) ? $(ids.removeRefererHeaderOnRedirect).checked === true : existing.removeRefererHeaderOnRedirect,
    strictHttpParser: $(ids.strictHttpParser) ? $(ids.strictHttpParser).checked === true : existing.strictHttpParser,
    encodeUrlAutomatically: $(ids.encodeUrlAutomatically) ? $(ids.encodeUrlAutomatically).checked === true : existing.encodeUrlAutomatically,
    maxRedirects: normalizeRendererMaxRedirects($(ids.maxRedirects)?.value ?? existing.maxRedirects),
    useServerCipherSuiteDuringHandshake: $(ids.useServerCipherSuiteDuringHandshake) ? $(ids.useServerCipherSuiteDuringHandshake).checked === true : existing.useServerCipherSuiteDuringHandshake,
    disabledTlsProtocols: normalizeRendererSettingsText($(ids.disabledTlsProtocols)?.value ?? existing.disabledTlsProtocols),
    cipherSuiteSelection: normalizeRendererSettingsText($(ids.cipherSuiteSelection)?.value ?? existing.cipherSuiteSelection)
  };
}

function collectCollectionAndMarkDirty(options = {}) {
  collectCollectionFromEditor(options);
  markActiveCollectionTabDirty();
  renderCollections();
  renderCollectionVariablePreview();
  renderVariablePreview();
  refreshVariableHighlights();
}

function collectFolderAndMarkDirty(options = {}) {
  collectFolderFromEditor(options);
  markActiveFolderTabDirty();
  renderCollections();
  renderFolderVariablePreview();
  renderVariablePreview();
  refreshVariableHighlights();
}

function collectCollectionFromEditor(options = {}) {
  const collection = activeCollection();
  if (!collection || !$('collectionMainPanel') || $('collectionMainPanel').hidden) {
    return;
  }
  const title = $('collectionMainTitle');
  if (title && title.dataset.editing === 'true') {
    collection.name = collectionTitleInputValue() || 'Untitled Collection';
  }
  collection.auth = collectCollectionAuthFromEditor();
  collection.scripts = {
    ...(collection.scripts || {}),
    preRequest: $('collectionPreRequestScriptInput')?.value || '',
    tests: $('collectionTestScriptInput')?.value || ''
  };
  if (options.includeVariables !== false) {
    collection.variables = collectKeyValueRowsFromTable('collectionVariablesTable', collection.variables || []);
  }
}

function collectFolderFromEditor(options = {}) {
  const folder = activeFolder();
  if (!folder || !$('folderMainPanel') || $('folderMainPanel').hidden) {
    return;
  }
  const title = $('folderMainTitle');
  if (title && title.dataset.editing === 'true') {
    folder.name = folderTitleInputValue() || 'Untitled Folder';
  }
  folder.auth = collectFolderAuthFromEditor();
  folder.scripts = {
    ...(folder.scripts || {}),
    preRequest: $('folderPreRequestScriptInput')?.value || '',
    tests: $('folderTestScriptInput')?.value || ''
  };
  if (options.includeVariables !== false) {
    folder.variables = collectKeyValueRowsFromTable('folderVariablesTable', folder.variables || []);
  }
}

function setActiveRequestAutoHeaderOption(option, value) {
  setActiveRequestAutoHeaderOptionForContext('request', option, value);
}

function collectRequestNameFromTitle(options = {}) {
  const request = activeRequest();
  if (!request) {
    return false;
  }
  const nextName = requestTitleInputValue() || 'Untitled Request';
  const changed = request.name !== nextName;
  request.name = nextName;
  if (changed && options.markDirty === true) {
    markActiveRequestDirty();
  }
  if (options.render !== false && changed) {
    if (activeAuthRefreshRequestOwnerType) {
      const owner = authRefreshOwner(activeAuthRefreshRequestOwnerType, activeAuthRefreshRequestOwnerId);
      renderAuthRefreshControls(activeAuthRefreshRequestOwnerType, owner?.authRefresh, Boolean(owner));
    } else if (activeRunnerRequestRunnerId) {
      renderRunnerEditor();
    } else {
      renderCollections();
    }
    renderRequestTabs();
  }
  const title = $('requestNameTitle');
  if (title && title.dataset.editing !== 'true') {
    title.textContent = requestDisplayName(request);
  }
  return changed;
}

function collectAuthFromEditor() {
  return collectRequestAuthFromEditor({
    doc: document,
    existingAuth: activeRequest()?.auth || {}
  });
}

function collectCollectionAuthFromEditor() {
  return collectRequestAuthFromEditor({
    doc: document,
    existingAuth: activeCollection()?.auth || {},
    idPrefix: 'collection'
  });
}

function collectFolderAuthFromEditor() {
  return collectRequestAuthFromEditor({
    doc: document,
    existingAuth: activeFolder()?.auth || {},
    idPrefix: 'folder'
  });
}

function collectPerformanceAuthFromEditor() {
  return collectRequestAuthFromEditor({
    doc: document,
    idPrefix: 'performance',
    existingAuth: activePerformanceTest()?.request?.auth || {}
  });
}

function autoSelectRefreshingAuthAccessTokenForOwner(ownerType, owner, previousAuthRefresh = {}, nextAuthRefresh = {}) {
  if (!shouldAutoSelectRefreshingAuthAccessToken(previousAuthRefresh, nextAuthRefresh)) {
    return false;
  }
  if (ownerType === 'performance') {
    return syncPerformanceRefreshingAuthAccessToken(owner, nextAuthRefresh);
  }
  return false;
}

function shouldAutoSelectRefreshingAuthAccessToken(previousAuthRefresh = {}, nextAuthRefresh = {}) {
  if (nextAuthRefresh?.enabled !== true) {
    return false;
  }
  const authType = String(nextAuthRefresh.authType || '').trim();
  if (!AUTO_REFRESH_SUPPORTED_AUTH_TYPES.has(authType)) {
    return false;
  }
  return previousAuthRefresh?.enabled !== true || String(previousAuthRefresh.authType || '').trim() !== authType;
}

function autoSelectRefreshingAuthAccessTokenForRequest(request, authRefresh = {}) {
  if (!request) {
    return false;
  }
  if (authRefresh?.enabled !== true) {
    return false;
  }
  const authType = String(authRefresh.authType || '').trim();
  if (!AUTO_REFRESH_SUPPORTED_AUTH_TYPES.has(authType)) {
    return false;
  }
  if (authType === 'cookie' && String(request.auth?.type || 'none').trim() === 'cookie') {
    request.refreshingAuthOriginalAuth = normalizeRefreshingAuthOriginalAuth(request.auth);
    request.auth = { type: 'none' };
    request.cookieJar = {
      ...(request.cookieJar || {}),
      enabled: true,
      storeResponses: true
    };
    request.useRefreshingAuthCookie = true;
    return true;
  }
  if (String(request.auth?.type || 'none').trim() !== authType) {
    return false;
  }
  request.auth = { type: AUTO_REFRESH_AUTH_TYPE };
  return true;
}

function syncPerformanceRefreshingAuthAccessToken(test, authRefresh = test?.authRefresh) {
  if (!test?.request) {
    syncPerformanceAutoRefreshAuthTypeOption({ type: 'none' }, authRefresh);
    return false;
  }
  const refreshType = String(authRefresh?.authType || '').trim();
  const enabled = authRefresh?.enabled === true && AUTO_REFRESH_SUPPORTED_AUTH_TYPES.has(refreshType);
  if (!enabled) {
    let restored = false;
    if (test.request.auth?.type === AUTO_REFRESH_AUTH_TYPE && test.request.refreshingAuthOriginalAuth) {
      test.request.auth = normalizeRefreshingAuthOriginalAuth(test.request.refreshingAuthOriginalAuth);
      delete test.request.refreshingAuthOriginalAuth;
      restored = true;
    }
    if (test.request.useRefreshingAuthCookie === true) {
      test.request.auth = normalizeRefreshingAuthOriginalAuth(test.request.refreshingAuthOriginalAuth);
      delete test.request.refreshingAuthOriginalAuth;
      delete test.request.useRefreshingAuthCookie;
      restored = true;
    }
    syncPerformanceAutoRefreshAuthTypeOption(test.request.auth, authRefresh);
    setValue('performanceAuthTypeSelect', test.request.auth?.type || 'none');
    showPerformanceAuthSection(test.request.auth?.type || 'none');
    setManagedCookieJarToggleState('performance', false);
    return restored;
  }
  if (refreshType === 'cookie') {
    let changed = false;
    if (test.request.useRefreshingAuthCookie !== true) {
      test.request.refreshingAuthOriginalAuth = normalizeRefreshingAuthOriginalAuth(test.request.auth);
      test.request.useRefreshingAuthCookie = true;
      changed = true;
    }
    if (test.request.auth?.type !== 'none') {
      test.request.auth = { type: 'none' };
      changed = true;
    }
    test.request.cookieJar = {
      ...(test.request.cookieJar || {}),
      enabled: true,
      storeResponses: true
    };
    syncPerformanceAutoRefreshAuthTypeOption(test.request.auth, authRefresh);
    setValue('performanceAuthTypeSelect', 'none');
    showPerformanceAuthSection('none');
    setChecked('performanceRequestCookieJarEnabledInput', true);
    setChecked('performanceRequestCookieJarStoreInput', true);
    setManagedCookieJarToggleState('performance', true);
    renderPerformanceCookieJarEditor();
    return changed;
  }
  let changed = false;
  if (test.request.useRefreshingAuthCookie === true) {
    test.request.auth = normalizeRefreshingAuthOriginalAuth(test.request.refreshingAuthOriginalAuth);
    delete test.request.refreshingAuthOriginalAuth;
    delete test.request.useRefreshingAuthCookie;
    changed = true;
  }
  if (test.request.auth?.type !== AUTO_REFRESH_AUTH_TYPE) {
    test.request.refreshingAuthOriginalAuth = normalizeRefreshingAuthOriginalAuth(test.request.auth);
    test.request.auth = { type: AUTO_REFRESH_AUTH_TYPE };
    changed = true;
  }
  delete test.request.useRefreshingAuthCookie;
  syncPerformanceAutoRefreshAuthTypeOption(test.request.auth, authRefresh);
  setManagedCookieJarToggleState('performance', false);
  showRefreshingAuthAccessTokenOption($('performanceAuthTypeSelect'), authRefresh);
  setValue('performanceAuthTypeSelect', AUTO_REFRESH_AUTH_TYPE);
  showPerformanceAuthSection(AUTO_REFRESH_AUTH_TYPE);
  return changed;
}

function collectEnvironmentFromEditor() {
  const environment = activeEditorEnvironment();
  if (environment) {
    const title = $('environmentMainTitle');
    environment.name = environmentTitleInputValue() || 'Untitled Environment';
    if (title.dataset.editing !== 'true') {
      title.textContent = environment.name;
    }
    renderEnvironmentSelect();
    renderEnvironments();
    renderWorkspacePanel();
  }
}

function collectRunnerRequestIterationsFromEditor(runner) {
  const requestList = $('runnerRequestList');
  if (!runner || !requestList) {
    return false;
  }
  let changed = false;
  const rows = requestList.querySelectorAll('.runner-request-row[data-runner-request-index]');
  for (const row of rows) {
    const index = Number.parseInt(row.dataset.runnerRequestIndex || '', 10);
    if (!Number.isInteger(index) || index < 0 || !runner.requests?.[index]) {
      continue;
    }
    const input = row.querySelector('.runner-row-iterations input');
    if (!input) {
      continue;
    }
    const previous = normalizeRunnerRequestIterations(runner.requests[index].iterations);
    const next = normalizeRunnerRequestIterations(input.value);
    runner.requests[index].iterations = next;
    input.value = String(next);
    if (next !== previous) {
      changed = true;
    }
  }
  return changed;
}

function collectRunnerFromEditor() {
  const runner = activeRunner();
  if (!runner) {
    return;
  }
  const previousShowRefreshingAuthToggle = runnerRefreshingAuthToggleVisible(runner);
  const previousRefreshingAuthType = String(runner.authRefresh?.authType || '').trim();
  runner.name = runnerTitleInputValue() || 'Untitled Runner';
  runner.environmentId = 'none';
  runner.stopOnFailure = $('runnerStopOnFailure')?.checked === true;
  runner.allowEnvironmentMutation = $('runnerAllowEnvironmentMutation')?.checked === true;
  runner.capturePolicy = collectCapturePolicyFromControls('runner', runner.capturePolicy || {});
  runner.authRefresh = collectAuthRefreshFromControls('runner', runner.authRefresh || {});
  const refreshTokenAuthAutoSelected = autoSelectRefreshingAuthRefreshTokenForAccessRequest('runner', runner);
  const restoredCookieRequests = restoreRunnerRefreshingCookieRequestsIfInactive(runner);
  syncAuthRefreshButton('runner', runner.authRefresh, true);
  runner.csvVariables = normalizeCsvVariableDataDefaultOff(runner.csvVariables);
  const iterationsChanged = collectRunnerRequestIterationsFromEditor(runner);
  runner.requests = normalizeRunnerRequests(runner.requests);
  const showRefreshingAuthToggle = runnerRefreshingAuthToggleVisible(runner);
  const refreshingAuthTypeChanged = previousRefreshingAuthType !== String(runner.authRefresh?.authType || '').trim();
  if (iterationsChanged || refreshTokenAuthAutoSelected || restoredCookieRequests) {
    markActiveRunnerDirty();
  }
  if (showRefreshingAuthToggle !== previousShowRefreshingAuthToggle || (showRefreshingAuthToggle && refreshingAuthTypeChanged)) {
    renderRunnerRequestList(runner);
  }
  renderCapturePolicyControls('runner', runner.capturePolicy, true);
  const title = $('runnerMainTitle');
  if (title && title.dataset.editing !== 'true') {
    title.textContent = runnerDisplayName(runner);
  }
  renderRunners();
}

function restoreRunnerRefreshingCookieRequestsIfInactive(runner) {
  if (!runner || (runner.authRefresh?.enabled === true && runnerAuthRefreshIsCookie(runner))) {
    return false;
  }
  let changed = false;
  for (const request of runner.requests || []) {
    if (request?.useRefreshingAuthCookie !== true) {
      continue;
    }
    request.auth = normalizeRefreshingAuthOriginalAuth(request.refreshingAuthOriginalAuth);
    delete request.refreshingAuthOriginalAuth;
    delete request.useRefreshingAuthCookie;
    changed = true;
  }
  return changed;
}

function collectPerformanceTestFromEditor(editedElement = null) {
  const test = activePerformanceTest();
  if (!test) {
    return;
  }
  const previousAuthRefresh = normalizeAuthRefreshConfig(test.authRefresh || {});
  test.name = performanceTitleInputValue() || 'Untitled Performance Test';
  const type = activePerformanceType() || test.type || 'diagnosis';
  test.type = type;
  collectPerformanceTypeSettingsFromPanel(test, type, activePerformanceTypePanel(), editedElement);
  syncPerformanceActiveTypeSettings(test);
  const collectedPerformanceAuth = collectPerformanceAuthFromEditor();
  test.csvVariables = normalizeCsvVariableDataDefaultOff(test.csvVariables);
  test.capturePolicy = collectCapturePolicyFromControls('performance', test.capturePolicy || {});
  test.authRefresh = collectAuthRefreshFromControls('performance', test.authRefresh || {});
  const refreshTokenAuthAutoSelected = autoSelectRefreshingAuthRefreshTokenForAccessRequest('performance', test);
  syncAuthRefreshButton('performance', test.authRefresh, true);
  test.request ||= {};
  test.request.id ||= crypto.randomUUID();
  test.request.name ||= 'Performance Request';
  let authSelectionChanged = false;
  collectRequestFieldsFromEditorContext('performance', test.request, {
    auth: collectedPerformanceAuth,
    collectDocs: true,
    afterAuth: () => {
      const authAutoSelected = autoSelectRefreshingAuthAccessTokenForOwner('performance', test, previousAuthRefresh, test.authRefresh);
      const performanceRequestAuthAutoSelected = syncPerformanceRefreshingAuthAccessToken(test, test.authRefresh);
      authSelectionChanged = authAutoSelected || performanceRequestAuthAutoSelected;
    },
    applyRefreshingCookieState: () => applyPerformanceRefreshingCookieState(test)
  });
  if (authSelectionChanged || refreshTokenAuthAutoSelected) {
    markActivePerformanceDirty();
  }
  test.source ||= { sourceType: 'manual' };
  renderCapturePolicyControls('performance', test.capturePolicy, true);
  const title = $('performanceMainTitle');
  if (title && title.dataset.editing !== 'true') {
    title.textContent = performanceTestDisplayName(test);
  }
  renderPerformanceTests();
}

function setActivePerformanceRequestAutoHeaderOption(option, value) {
  setActiveRequestAutoHeaderOptionForContext('performance', option, value);
}

function setActiveRequestAutoHeaderOptionForContext(contextOrScope, option, value) {
  const context = typeof contextOrScope === 'string' ? requestEditorContext(contextOrScope) : contextOrScope;
  const request = activeRequestForEditorContext(context);
  if (!request) {
    return;
  }
  if (context.scope === 'performance') {
    collectPerformanceTestFromEditor();
  } else {
    collectRequestFromEditor();
  }
  const updatedRequest = activeRequestForEditorContext(context) || request;
  const autoHeaders = ensureRequestAutoHeaders(updatedRequest);
  autoHeaders[option] = value === true;
  markRequestEditorContextDirty(context);
  renderRequestEditorForContextScope(context);
}

function collectKeyValueRowsFromTable(containerId, fallback = []) {
  const container = $(containerId);
  if (!container) {
    return Array.isArray(fallback) ? fallback : [];
  }
  const rows = Array.from(container.querySelectorAll('.kv-row')).filter((row) => row.dataset.generatedHeader !== 'true');
  if (!rows.length) {
    return [];
  }
  return rows.map((row) => {
    const inputs = row.querySelectorAll('input');
    return {
      enabled: inputs[0]?.checked !== false,
      key: inputs[1]?.value || '',
      value: inputs[2]?.value || ''
    };
  });
}

function collectPerformanceTypeSettingsFromPanel(test, type, panel, editedElement = null) {
  if (!test || !RENDERER_PERFORMANCE_TEST_TYPES.includes(type) || !panel) {
    return;
  }
  const previous = performanceTypeSettings(test, type);
  clampPerformancePanelNumericInputs(type, panel, previous, editedElement || document.activeElement);
  const minimumDurationSeconds = type === 'soak' ? 1 : 0;
  const config = {
    iterations: clampPerformanceConfigInput('iterations', 1, PERFORMANCE_MAX_SAFETY_LIMITS.maxTotalRequests, previous.config?.iterations || 1, panel),
    startConcurrency: clampPerformanceConfigInput('startConcurrency', 1, PERFORMANCE_MAX_SAFETY_LIMITS.maxConcurrency, previous.config?.startConcurrency || 1, panel),
    concurrency: clampPerformanceConfigInput('concurrency', 1, PERFORMANCE_MAX_SAFETY_LIMITS.maxConcurrency, previous.config?.concurrency || 1, panel),
    durationSeconds: clampPerformanceConfigInput('durationSeconds', minimumDurationSeconds, PERFORMANCE_MAX_SAFETY_LIMITS.maxDurationSeconds, previous.config?.durationSeconds || minimumDurationSeconds, panel),
    rampSteps: clampPerformanceConfigInput('rampSteps', 1, PERFORMANCE_MAX_SAFETY_LIMITS.maxTotalRequests, previous.config?.rampSteps || 1, panel),
    spikeMultiplier: clampPerformanceConfigInput('spikeMultiplier', 1, PERFORMANCE_MAX_SAFETY_LIMITS.maxConcurrency, previous.config?.spikeMultiplier || 1, panel),
    diagnosisScope: collectPerformanceDiagnosisScope(panel, previous.config?.diagnosisScope)
  };
  if (type === 'diagnosis') {
    const profile = diagnosisProfileForScope(config.diagnosisScope);
    config.iterations = profile.totalRequests;
    syncDiagnosisScopeDurationSafety(panel, previous, config, editedElement || document.activeElement);
  }
  const safetyLimits = {
    maxTotalRequests: clampPerformanceSafetyInput('maxTotalRequests', 1, PERFORMANCE_MAX_SAFETY_LIMITS.maxTotalRequests, previous.safetyLimits?.maxTotalRequests || 100, panel),
    maxConcurrency: clampPerformanceSafetyInput('maxConcurrency', 1, PERFORMANCE_MAX_SAFETY_LIMITS.maxConcurrency, previous.safetyLimits?.maxConcurrency || 10, panel),
    maxDurationSeconds: clampPerformanceSafetyInput('maxDurationSeconds', 1, PERFORMANCE_MAX_SAFETY_LIMITS.maxDurationSeconds, previous.safetyLimits?.maxDurationSeconds || 60, panel)
  };
  if (type === 'diagnosis') {
    const profile = diagnosisProfileForScope(config.diagnosisScope);
    safetyLimits.maxTotalRequests = profile.totalRequests;
    safetyLimits.maxDurationSeconds = Math.max(safetyLimits.maxDurationSeconds, profile.maxDurationSeconds);
    setPerformancePanelControlValue(panel, 'safety', 'maxDurationSeconds', safetyLimits.maxDurationSeconds);
  }
  if (!panel.querySelector('[data-performance-safety="maxTotalRequests"]')) {
    safetyLimits.maxTotalRequests = Math.max(
      safetyLimits.maxTotalRequests,
      performancePlannedRequestCount(type, config, safetyLimits)
    );
  }
  if (!panel.querySelector('[data-performance-safety="maxConcurrency"]')) {
    safetyLimits.maxConcurrency = Math.max(
      safetyLimits.maxConcurrency,
      performanceEffectiveConcurrency(type, config)
    );
  }
  const panelIsActive = panel.classList.contains('active');
  const mutationControl = panelIsActive
    ? $('performanceAllowEnvironmentMutationInput') || panel.querySelector('[data-performance-mutation]')
    : panel.querySelector('[data-performance-mutation]');
  test.typeSettings[type] = {
    environmentId: 'none',
    allowEnvironmentMutation: mutationControl?.checked === true,
    config,
    safetyLimits
  };
}

function syncDiagnosisScopeDurationSafety(panel, previous = {}, config = {}, editedElement = document.activeElement) {
  const edited = activePerformancePanelField(panel, editedElement);
  if (edited.kind !== 'config' || edited.name !== 'diagnosisScope') {
    return;
  }
  const durationInput = performancePanelInput(panel, 'safety', 'maxDurationSeconds');
  if (!durationInput) {
    return;
  }
  const previousProfile = diagnosisProfileForScope(previous.config?.diagnosisScope);
  const nextProfile = diagnosisProfileForScope(config.diagnosisScope);
  const parsedDuration = Number.parseInt(durationInput.value || '', 10);
  const currentDuration = Number.isFinite(parsedDuration)
    ? parsedDuration
    : Number(previous.safetyLimits?.maxDurationSeconds || previousProfile.maxDurationSeconds);
  if (currentDuration <= previousProfile.maxDurationSeconds) {
    setPerformancePanelControlValue(panel, 'safety', 'maxDurationSeconds', nextProfile.maxDurationSeconds);
  }
}

function performancePlannedRequestCount(type, config, safetyLimits) {
  if (type === 'diagnosis') {
    return diagnosisProfileForScope(config.diagnosisScope).totalRequests;
  }
  if (type === 'soak') {
    return safetyLimits.maxTotalRequests || 1;
  }
  if (type === 'concurrency') {
    return (config.iterations || 1) * (config.concurrency || 1);
  }
  if (type === 'stress' || type === 'ramp') {
    return (config.iterations || 1) * (config.rampSteps || 1);
  }
  return config.iterations || 1;
}

function performanceEffectiveConcurrency(type, config) {
  if (type === 'diagnosis') {
    return Math.min(25, Math.max(config.concurrency || 5, (config.concurrency || 5) * (config.spikeMultiplier || 2)));
  }
  if (type === 'latency') {
    return 1;
  }
  if (type === 'spike') {
    return (config.concurrency || 1) * (config.spikeMultiplier || 1);
  }
  if (type === 'stress' || type === 'ramp') {
    return Math.max(config.startConcurrency || 1, config.concurrency || 1);
  }
  return config.concurrency || 1;
}

function performancePanelInput(panel, kind, name) {
  const attribute = kind === 'safety' ? 'data-performance-safety' : 'data-performance-config';
  return panel?.querySelector(`[${attribute}="${name}"]`) || null;
}

function activePerformancePanelField(panel, target = document.activeElement) {
  const active = target || document.activeElement;
  if (!active || !panel?.contains(active)) {
    return { kind: '', name: '' };
  }
  if (active.dataset?.performanceConfig) {
    return { kind: 'config', name: active.dataset.performanceConfig };
  }
  if (active.dataset?.performanceSafety) {
    return { kind: 'safety', name: active.dataset.performanceSafety };
  }
  return { kind: '', name: '' };
}

function clampPerformancePanelInputElement(element, min, max, fallback) {
  if (!element) {
    return fallback;
  }
  const safeMin = Number.isFinite(Number(min)) ? Number(min) : 1;
  const safeMax = Math.max(safeMin, Number.isFinite(Number(max)) ? Number(max) : safeMin);
  element.min = String(safeMin);
  element.max = String(safeMax);
  const parsed = Number.parseInt(element.value || '', 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const next = Math.max(safeMin, Math.min(safeMax, parsed));
  if (String(next) !== element.value) {
    element.value = String(next);
  }
  return next;
}

function setPerformancePanelInputMax(panel, kind, name, max) {
  const element = performancePanelInput(panel, kind, name);
  if (element) {
    element.max = String(Math.max(1, Number(max || 1)));
  }
}

function clampPerformanceConfigPanelInput(panel, name, min, max, fallback) {
  return clampPerformancePanelInputElement(
    performancePanelInput(panel, 'config', name),
    min,
    max,
    fallback
  );
}

function clampPerformanceSafetyPanelInput(panel, name, min, max, fallback) {
  return clampPerformancePanelInputElement(
    performancePanelInput(panel, 'safety', name),
    min,
    max,
    fallback
  );
}

function clampPerformancePanelNumericInputs(type, panel, previous = {}, editedElement = document.activeElement) {
  if (!panel) {
    return;
  }
  const edited = activePerformancePanelField(panel, editedElement);
  const previousConfig = previous.config || {};
  const previousSafety = previous.safetyLimits || {};
  const minimumDurationSeconds = type === 'soak' ? 1 : 0;
  const maxTotalRequests = clampPerformanceSafetyPanelInput(
    panel,
    'maxTotalRequests',
    1,
    PERFORMANCE_MAX_SAFETY_LIMITS.maxTotalRequests,
    previousSafety.maxTotalRequests || 100
  );
  const maxConcurrency = clampPerformanceSafetyPanelInput(
    panel,
    'maxConcurrency',
    1,
    PERFORMANCE_MAX_SAFETY_LIMITS.maxConcurrency,
    previousSafety.maxConcurrency || 10
  );
  const maxDurationSeconds = clampPerformanceSafetyPanelInput(
    panel,
    'maxDurationSeconds',
    1,
    PERFORMANCE_MAX_SAFETY_LIMITS.maxDurationSeconds,
    previousSafety.maxDurationSeconds || 60
  );
  clampPerformanceConfigPanelInput(
    panel,
    'durationSeconds',
    minimumDurationSeconds,
    type === 'soak' ? maxDurationSeconds : PERFORMANCE_MAX_SAFETY_LIMITS.maxDurationSeconds,
    previousConfig.durationSeconds || minimumDurationSeconds
  );
  let iterations = clampPerformanceConfigPanelInput(
    panel,
    'iterations',
    1,
    PERFORMANCE_MAX_SAFETY_LIMITS.maxTotalRequests,
    previousConfig.iterations || 1
  );
  let rampSteps = clampPerformanceConfigPanelInput(
    panel,
    'rampSteps',
    1,
    PERFORMANCE_MAX_SAFETY_LIMITS.maxTotalRequests,
    previousConfig.rampSteps || 1
  );
  let concurrency = clampPerformanceConfigPanelInput(
    panel,
    'concurrency',
    1,
    PERFORMANCE_MAX_SAFETY_LIMITS.maxConcurrency,
    previousConfig.concurrency || 1
  );
  clampPerformanceConfigPanelInput(
    panel,
    'startConcurrency',
    1,
    maxConcurrency,
    previousConfig.startConcurrency || 1
  );
  let spikeMultiplier = clampPerformanceConfigPanelInput(
    panel,
    'spikeMultiplier',
    1,
    PERFORMANCE_MAX_SAFETY_LIMITS.maxConcurrency,
    previousConfig.spikeMultiplier || 1
  );

  if (type === 'throughput' || type === 'spike') {
    iterations = clampPerformanceConfigPanelInput(panel, 'iterations', 1, maxTotalRequests, iterations);
    if (type === 'throughput') {
      clampPerformanceConfigPanelInput(panel, 'concurrency', 1, maxConcurrency, concurrency);
    }
  } else if (type === 'concurrency') {
    if (edited.kind === 'config' && edited.name === 'concurrency') {
      const maxUsers = Math.max(1, Math.floor(maxTotalRequests / Math.max(1, iterations)));
      concurrency = clampPerformanceConfigPanelInput(panel, 'concurrency', 1, Math.min(maxConcurrency, maxUsers), concurrency);
      setPerformancePanelInputMax(panel, 'config', 'iterations', Math.max(1, Math.floor(maxTotalRequests / Math.max(1, concurrency))));
    } else {
      concurrency = clampPerformanceConfigPanelInput(panel, 'concurrency', 1, Math.min(maxConcurrency, maxTotalRequests), concurrency);
      iterations = clampPerformanceConfigPanelInput(panel, 'iterations', 1, Math.max(1, Math.floor(maxTotalRequests / Math.max(1, concurrency))), iterations);
    }
  } else if (type === 'stress' || type === 'ramp') {
    if (edited.kind === 'config' && edited.name === 'rampSteps') {
      const maxSteps = Math.max(1, Math.floor(maxTotalRequests / Math.max(1, iterations)));
      rampSteps = clampPerformanceConfigPanelInput(panel, 'rampSteps', 1, maxSteps, rampSteps);
      setPerformancePanelInputMax(panel, 'config', 'iterations', Math.max(1, Math.floor(maxTotalRequests / Math.max(1, rampSteps))));
    } else {
      rampSteps = clampPerformanceConfigPanelInput(panel, 'rampSteps', 1, maxTotalRequests, rampSteps);
      iterations = clampPerformanceConfigPanelInput(panel, 'iterations', 1, Math.max(1, Math.floor(maxTotalRequests / Math.max(1, rampSteps))), iterations);
    }
    const startConcurrency = clampPerformanceConfigPanelInput(
      panel,
      'startConcurrency',
      1,
      maxConcurrency,
      previousConfig.startConcurrency || 1
    );
    const peakConcurrency = clampPerformanceConfigPanelInput(panel, 'concurrency', 1, maxConcurrency, concurrency);
    if (edited.kind === 'config' && edited.name === 'startConcurrency') {
      clampPerformanceConfigPanelInput(panel, 'startConcurrency', 1, peakConcurrency, startConcurrency);
    } else {
      clampPerformanceConfigPanelInput(panel, 'concurrency', startConcurrency, maxConcurrency, peakConcurrency);
    }
  }

  if (type === 'spike') {
    concurrency = clampPerformanceConfigPanelInput(panel, 'concurrency', 1, maxConcurrency, concurrency);
    if (edited.kind === 'config' && edited.name === 'concurrency') {
      const maxBaseline = Math.max(1, Math.floor(maxConcurrency / Math.max(1, spikeMultiplier)));
      concurrency = clampPerformanceConfigPanelInput(panel, 'concurrency', 1, maxBaseline, concurrency);
      setPerformancePanelInputMax(panel, 'config', 'spikeMultiplier', Math.max(1, Math.floor(maxConcurrency / Math.max(1, concurrency))));
    } else {
      spikeMultiplier = clampPerformanceConfigPanelInput(
        panel,
        'spikeMultiplier',
        1,
        Math.max(1, Math.floor(maxConcurrency / Math.max(1, concurrency))),
        spikeMultiplier
      );
    }
  } else if (type === 'soak') {
    clampPerformanceConfigPanelInput(panel, 'concurrency', 1, maxConcurrency, concurrency);
  }
}

function normalizeDiagnosisScope(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return DIAGNOSIS_SCOPE_PROFILES?.[normalized] ? normalized : 'quick';
}

function diagnosisProfileForScope(value) {
  return DIAGNOSIS_SCOPE_PROFILES[normalizeDiagnosisScope(value)];
}

function collectPerformanceDiagnosisScope(panel, fallback = 'quick') {
  const value = panel?.querySelector('[data-performance-config="diagnosisScope"]')?.value;
  return normalizeDiagnosisScope(value || fallback);
}

function activePerformanceType() {
  const selectedType = $('performanceTypeSelect')?.value || '';
  if (RENDERER_PERFORMANCE_TEST_TYPES.includes(selectedType)) {
    return selectedType;
  }
  const type = document.querySelector('.tab[data-tab-group="performance"].active')?.dataset.tab || '';
  return RENDERER_PERFORMANCE_TEST_TYPES.includes(type) ? type : '';
}

function activePerformanceTypePanel() {
  const type = activePerformanceType();
  if (type) {
    return $(`${type}Tab`) || document.querySelector('.performance-type-panel.active');
  }
  return document.querySelector('.performance-type-panel.active');
}

function clampPerformanceConfigInput(name, min, max, fallback, panel = activePerformanceTypePanel()) {
  return clampNumberElement(panel?.querySelector(`[data-performance-config="${name}"]`), min, max, fallback);
}

function clampPerformanceSafetyInput(name, min, max, fallback, panel = activePerformanceTypePanel()) {
  return clampNumberElement(panel?.querySelector(`[data-performance-safety="${name}"]`), min, max, fallback);
}

function clampNumberInput(id, min, max, fallback) {
  return clampNumberElement($(id), min, max, fallback);
}

function clampNumberElement(element, min, max, fallback) {
  const number = Number.parseInt(element?.value || '', 10);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
}

function environmentTitleInputValue() {
  return String($('environmentMainTitle')?.textContent || '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function collectionTitleInputValue() {
  return String($('collectionMainTitle')?.textContent || '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function folderTitleInputValue() {
  return String($('folderMainTitle')?.textContent || '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function workspaceTitleInputValue() {
  return String($('workspaceMainTitle')?.textContent || '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function runnerTitleInputValue() {
  return String($('runnerMainTitle')?.textContent || '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function performanceTitleInputValue() {
  return String($('performanceMainTitle')?.textContent || '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function requestTitleInputValue() {
  return String($('requestNameTitle')?.textContent || '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function activeCollection() {
  return (workspace?.collections || []).find((collection) => collection.id === activeCollectionId) || null;
}

function activeFolder() {
  const collection = activeCollection();
  return collection && activeFolderId ? findFolder(collection, activeFolderId) : null;
}

function activeFolderForActiveRequest() {
  const collection = activeCollection();
  if (!collection) {
    return null;
  }
  if (activeRequestId) {
    return findRequest(collection, activeRequestId)?.folder || null;
  }
  return activeFolder();
}

function activeFolderPathForActiveRequest() {
  const collection = activeCollection();
  if (!collection) {
    return [];
  }
  if (activeRequestId) {
    return findRequest(collection, activeRequestId)?.folders || [];
  }
  return activeFolderId ? findFolderPath(collection, activeFolderId) : [];
}

function effectiveFolderVariablesForPath(folders) {
  const variables = [];
  for (const folder of folders || []) {
    for (const variable of folder?.variables || []) {
      if (!variable || variable.enabled === false || !String(variable.key || '').trim()) {
        continue;
      }
      const key = String(variable.key).trim();
      const existing = variables.findIndex((item) => item.key === key);
      if (existing >= 0) {
        variables[existing] = { ...variable, key };
      } else {
        variables.push({ ...variable, key });
      }
    }
  }
  return variables;
}

function effectiveFolderAuthForPath(folders) {
  for (let index = (folders || []).length - 1; index >= 0; index -= 1) {
    const auth = folders[index]?.auth;
    if (requestHasOwnAuth(auth)) {
      return auth;
    }
  }
  return { type: 'none' };
}

function activeRunner() {
  ensureWorkspaceRunners();
  return (workspace?.runners || []).find((runner) => runner.id === activeRunnerConfigId) || null;
}

function activePerformanceTest() {
  ensureWorkspacePerformanceTests();
  return (workspace?.performanceTests || []).find((test) => test.id === activePerformanceTestId) || null;
}

function runnerDisplayName(runner = activeRunner()) {
  return typeof rendererEntityDisplay?.runnerDisplayName === 'function'
    ? rendererEntityDisplay.runnerDisplayName(runner)
    : String(runner?.name || '').trim() || 'Untitled Runner';
}

function performanceTestDisplayName(test = activePerformanceTest()) {
  return typeof rendererEntityDisplay?.performanceTestDisplayName === 'function'
    ? rendererEntityDisplay.performanceTestDisplayName(test)
    : String(test?.name || '').trim() || 'Untitled Performance Test';
}

function activeEnvironment() {
  return (workspace?.environments || []).find((environment) => environment.id === activeEnvironmentId) || null;
}

function activeEditorEnvironment() {
  return (workspace?.environments || []).find((environment) => environment.id === activeEnvironmentEditorId) || null;
}

function activeRequest() {
  if (!activeCollectionId && !activeRunnerRequestRunnerId && activeAuthRefreshRequestOwnerType && activeAuthRefreshRequestOwnerId && activeRequestId) {
    const owner = authRefreshOwner(activeAuthRefreshRequestOwnerType, activeAuthRefreshRequestOwnerId);
    return authRefreshOwnedRequest(owner?.authRefresh, activeRequestId);
  }
  if (activeRunnerRequestRunnerId && activeRequestId) {
    const runner = (workspace?.runners || []).find((item) => item.id === activeRunnerRequestRunnerId);
    return (runner?.requests || []).find((request) => request.id === activeRequestId) || null;
  }
  if (!activeCollectionId && activeRequestId) {
    return draftRequests.get(activeRequestId) || null;
  }
  const collection = activeCollection();
  if (!collection || !activeRequestId) {
    return null;
  }
  return findRequest(collection, activeRequestId)?.request || null;
}

function authRefreshOwner(ownerType, ownerId) {
  if (ownerType === 'runner') {
    return (workspace?.runners || []).find((runner) => runner.id === ownerId) || null;
  }
  if (ownerType === 'performance') {
    return (workspace?.performanceTests || []).find((test) => test.id === ownerId) || null;
  }
  return null;
}

function authRefreshOwnedRequest(authRefresh, requestId) {
  const property = authRefreshRequestPropertyForId(authRefresh, requestId);
  return property ? authRefresh[property] : null;
}

function authRefreshRequestPropertyForId(authRefresh, requestId) {
  if (!authRefresh || !requestId) {
    return '';
  }
  if (authRefresh.request?.id === requestId) {
    return 'request';
  }
  if (authRefresh.refreshTokenRequest?.id === requestId) {
    return 'refreshTokenRequest';
  }
  return '';
}

function activateTab(groupName, tabName) {
  const panelIds = TAB_PANEL_IDS[groupName] || [];
  if (groupName === 'performance') {
    const test = activePerformanceTest();
    const currentType = activePerformanceType();
    if (test && RENDERER_PERFORMANCE_TEST_TYPES.includes(currentType)) {
      collectPerformanceTypeSettingsFromPanel(test, currentType, activePerformanceTypePanel());
    }
  }
  for (const button of document.querySelectorAll(`.tab[data-tab-group="${groupName}"]`)) {
    if (button.dataset.tab) {
      const isActive = button.dataset.tab === tabName;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      button.tabIndex = isActive ? 0 : -1;
    }
  }
  for (const panelId of panelIds) {
    const panel = $(panelId);
    const isActive = panel.id === `${tabName}Tab`;
    panel.classList.toggle('active', isActive);
    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  }
  if (groupName === 'performance' && RENDERER_PERFORMANCE_TEST_TYPES.includes(tabName)) {
    const test = activePerformanceTest();
    if ($('performanceTypeSelect')) {
      $('performanceTypeSelect').value = tabName;
    }
    if (test) {
      const changed = test.type !== tabName;
      test.type = tabName;
      syncPerformanceActiveTypeSettings(test);
      renderPerformanceTypeTabs(test);
      renderPerformanceMutationControls(test);
      if (changed) {
        markActivePerformanceDirty();
      }
      renderCapturePolicyControls('performance', test.capturePolicy, true);
    }
  }
  scheduleSessionSave();
}

function formatBytes(bytes) {
  if (typeof RENDERER_UI_UTILITIES.formatBytes === 'function') {
    return RENDERER_UI_UTILITIES.formatBytes(bytes);
  }
  const value = Math.max(0, Number(bytes || 0));
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function setStatus(message) {
  lastStatusMessage = String(message || '');
}

function notifyUser(title, message) {
  const notification = typeof RENDERER_UI_UTILITIES.notificationPayload === 'function'
    ? RENDERER_UI_UTILITIES.notificationPayload(title, message)
    : { title: String(title || 'PostMeter'), message: String(message || '') };
  lastUserNotification = notification;
  if (typeof window.__postmeterNotifyUser === 'function') {
    window.__postmeterNotifyUser(notification);
    return;
  }
  if (isAutomatedUiSmoke()) {
    return;
  }
  void showNotificationModal(notification.title, notification.message);
}

function isAutomatedUiSmoke() {
  if (typeof RENDERER_UI_UTILITIES.isAutomatedUiSmokeSearch === 'function') {
    return RENDERER_UI_UTILITIES.isAutomatedUiSmokeSearch(window.location.search);
  }
  const params = new URLSearchParams(window.location.search);
  return params.get('uiWorkflowSmoke') === '1'
    || params.get('uiRegressionSmoke') === '1'
    || params.get('uiSnapshotSmoke') === '1'
    || params.get('uiTypographySmoke') === '1'
    || params.get('uiOauthSmoke') === '1'
    || params.get('uiHawkSmoke') === '1'
    || params.get('uiAwsSmoke') === '1'
    || params.get('uiA11ySmoke') === '1';
}
