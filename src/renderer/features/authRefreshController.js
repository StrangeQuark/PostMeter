function openAuthRefreshSettingsPanel(prefix) {
  const panel = $(`${prefix}AuthRefreshPanel`);
  const button = $(`${prefix}AuthRefreshButton`);
  if (!panel || !button || button.disabled) {
    return;
  }
  closeToolbarMenus();
  closeContextMenu();
  closeFileSourceMenu();
  closeCaptureSettingsPanels({ exceptPanel: panel });
  panel.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  positionAuthRefreshPanel(prefix);
  panel.querySelector('select, input, button, textarea')?.focus?.();
}

function renderAuthRefreshControls(prefix, authRefresh, enabled) {
  const normalized = normalizeAuthRefreshConfig(authRefresh || {});
  const authType = normalizeAuthRefreshUiType(normalized.authType);
  setValue(`${prefix}AuthRefreshTypeSelect`, authType);
  const accessTokenOutput = authRefreshOutputForSlot(normalized, 'accessToken', {
    source: 'body',
    path: normalized.accessTokenPath,
    variable: normalized.accessTokenVariable
  });
  const refreshTokenOutput = authRefreshOutputForSlot(normalized, 'refreshToken', {
    source: 'body',
    path: normalized.refreshTokenPath,
    variable: normalized.refreshTokenVariable
  });
  const apiKeyOutput = authRefreshOutputForSlot(normalized, 'apiKey', authRefreshDefaultOutput('apiKey'));
  const cookieOutput = authRefreshOutputForSlot(normalized, 'cookie', authRefreshDefaultOutput('cookie'));
  const awsAccessKeyOutput = authRefreshOutputForSlot(normalized, 'awsAccessKey', authRefreshDefaultOutput('awsAccessKey'));
  const awsSecretKeyOutput = authRefreshOutputForSlot(normalized, 'awsSecretKey', authRefreshDefaultOutput('awsSecretKey'));
  const awsSessionTokenOutput = authRefreshOutputForSlot(normalized, 'awsSessionToken', authRefreshDefaultOutput('awsSessionToken'));
  const customOutput = authRefreshOutputForSlot(normalized, 'custom', authRefreshDefaultOutput('custom'));
  setValue(`${prefix}AuthRefreshAccessTokenVariableInput`, accessTokenOutput.variable);
  setValue(`${prefix}AuthRefreshRefreshTokenVariableInput`, refreshTokenOutput.variable);
  renderAuthRefreshRequestSummary(prefix, normalized.request);
  renderAuthRefreshTokenRequestSummary(prefix, normalized.refreshTokenRequest);
  setValue(`${prefix}AuthRefreshAccessTokenPathInput`, accessTokenOutput.path);
  setValue(`${prefix}AuthRefreshRefreshTokenPathInput`, refreshTokenOutput.path);
  setValue(`${prefix}AuthRefreshApiKeyLocationSelect`, normalized.apiKeyLocation || 'header');
  setValue(`${prefix}AuthRefreshApiKeyNameInput`, normalized.apiKeyName || 'X-API-Key');
  setValue(`${prefix}AuthRefreshApiKeyPathInput`, apiKeyOutput.path);
  setValue(`${prefix}AuthRefreshCookieNameInput`, cookieOutput.path);
  setValue(`${prefix}AuthRefreshCookieVariableInput`, cookieOutput.variable);
  setValue(`${prefix}AuthRefreshAwsAccessKeyVariableInput`, awsAccessKeyOutput.variable);
  setValue(`${prefix}AuthRefreshAwsAccessKeyPathInput`, awsAccessKeyOutput.path);
  setValue(`${prefix}AuthRefreshAwsSecretKeyVariableInput`, awsSecretKeyOutput.variable);
  setValue(`${prefix}AuthRefreshAwsSecretKeyPathInput`, awsSecretKeyOutput.path);
  setValue(`${prefix}AuthRefreshAwsSessionTokenVariableInput`, awsSessionTokenOutput.variable);
  setValue(`${prefix}AuthRefreshAwsSessionTokenPathInput`, awsSessionTokenOutput.path);
  setValue(`${prefix}AuthRefreshAwsCredentialsSourceSelect`, awsCredentialsOutputSource([
    awsAccessKeyOutput,
    awsSecretKeyOutput,
    awsSessionTokenOutput
  ]));
  setValue(`${prefix}AuthRefreshCustomVariableInput`, customOutput.variable);
  setValue(`${prefix}AuthRefreshCustomPathInput`, customOutput.path);
  setValue(`${prefix}AuthRefreshIntervalSecondsInput`, normalized.refreshIntervalSeconds);
  setValue(`${prefix}AuthRefreshFailurePolicySelect`, normalized.failurePolicy);
  setChecked(`${prefix}AuthRefreshBeforeRunInput`, normalized.refreshBeforeRun === true);
  renderAuthRefreshVariableSuggestions(prefix);
  applyAuthRefreshTypeVisibility(prefix, authType);
  setAuthRefreshOutputControls(prefix, 'AccessToken', accessTokenOutput, authType);
  setAuthRefreshOutputControls(prefix, 'RefreshToken', refreshTokenOutput);
  setAuthRefreshOutputControls(prefix, 'ApiKey', apiKeyOutput);
  setAuthRefreshOutputControls(prefix, 'AwsAccessKey', awsAccessKeyOutput);
  setAuthRefreshOutputControls(prefix, 'AwsSecretKey', awsSecretKeyOutput);
  setAuthRefreshOutputControls(prefix, 'AwsSessionToken', awsSessionTokenOutput);
  setAuthRefreshOutputControls(prefix, 'Custom', customOutput);
  const button = $(`${prefix}AuthRefreshButton`);
  if (button) {
    const active = enabled && normalized.enabled === true;
    button.disabled = !enabled;
    button.textContent = `Refreshing Auth: ${active ? 'On' : 'Off'}`;
    button.classList.toggle('auth-refresh-active', active);
  }
  const toggleButton = $(`${prefix}ToggleAuthRefreshButton`);
  if (toggleButton) {
    toggleButton.disabled = !enabled;
    toggleButton.textContent = normalized.enabled === true ? 'Turn Off' : 'Turn On';
  }
  const editButton = $(`${prefix}EditAuthRefreshButton`);
  if (editButton) {
    editButton.disabled = !enabled;
  }
  for (const control of document.querySelectorAll(`#${prefix}AuthRefreshPanel input, #${prefix}AuthRefreshPanel select, #${prefix}AuthRefreshPanel textarea`)) {
    control.disabled = !enabled;
  }
  for (const control of document.querySelectorAll(`#${prefix}AuthRefreshPanel button`)) {
    if (control.id !== `${prefix}AuthRefreshButton`) {
      control.disabled = !enabled;
    }
  }
  const openButton = $(`${prefix}AuthRefreshOpenRequestButton`);
  if (openButton) {
    openButton.disabled = !enabled || !authRefreshRequestConfigured(authRefresh?.request);
  }
  const autoDetectButton = $(`${prefix}AuthRefreshAutoDetectRequestButton`);
  if (autoDetectButton) {
    autoDetectButton.disabled = !enabled || !authRefreshRequestConfigured(authRefresh?.request);
  }
  const removeButton = $(`${prefix}AuthRefreshRemoveRequestButton`);
  if (removeButton) {
    removeButton.disabled = !enabled || !authRefreshRequestConfigured(authRefresh?.request);
  }
  const refreshTokenOpenButton = $(`${prefix}AuthRefreshTokenOpenRequestButton`);
  if (refreshTokenOpenButton) {
    refreshTokenOpenButton.disabled = !enabled || !authRefreshRequestConfigured(authRefresh?.refreshTokenRequest);
  }
  const refreshTokenAutoDetectButton = $(`${prefix}AuthRefreshTokenAutoDetectRequestButton`);
  if (refreshTokenAutoDetectButton) {
    refreshTokenAutoDetectButton.disabled = !enabled || !authRefreshRequestConfigured(authRefresh?.refreshTokenRequest);
  }
  const refreshTokenRemoveButton = $(`${prefix}AuthRefreshTokenRemoveRequestButton`);
  if (refreshTokenRemoveButton) {
    refreshTokenRemoveButton.disabled = !enabled || !authRefreshRequestConfigured(authRefresh?.refreshTokenRequest);
  }
  syncVisibleRefreshingAuthTypeOptionsForOwner(prefix, normalized);
  positionVisibleAuthRefreshPanel(prefix);
  if (!enabled) {
    const panel = $(`${prefix}AuthRefreshPanel`);
    if (panel) {
      panel.hidden = true;
    }
    button?.setAttribute('aria-expanded', 'false');
  }
}

function renderAuthRefreshRequestSummary(prefix, request) {
  const summary = $(`${prefix}AuthRefreshRequestSummary`);
  renderAuthRefreshRequestSummaryElement(summary, request, 'No auth request selected', 'Refresh Auth');
}

function renderAuthRefreshTokenRequestSummary(prefix, request) {
  const summary = $(`${prefix}AuthRefreshTokenRequestSummary`);
  renderAuthRefreshRequestSummaryElement(summary, request, 'No refresh token request selected', 'Refresh Token');
}

function renderAuthRefreshRequestSummaryElement(summary, request, emptyText, fallbackName) {
  if (!summary) {
    return;
  }
  if (!authRefreshRequestConfigured(request)) {
    summary.textContent = emptyText;
    summary.title = summary.textContent;
    return;
  }
  const method = requestMethodText(request);
  const name = String(request?.name || '').trim() || fallbackName;
  const url = String(request?.url || '').trim();
  summary.textContent = url ? `${method} ${name} - ${url}` : `${method} ${name}`;
  summary.title = summary.textContent;
}

function authRefreshRequestConfigured(request = {}) {
  const id = String(request?.id || '').trim();
  return Boolean(String(request?.url || '').trim() || (id && !authRefreshDefaultRequestIds().has(id)));
}

function authRefreshRequestHasUrl(request = {}) {
  return Boolean(String(request?.url || '').trim());
}

function authRefreshDefaultRequestIds() {
  return new Set(['auth-refresh-request', 'auth-refresh-token-request']);
}

function positionVisibleAuthRefreshPanel(prefix) {
  const panel = $(`${prefix}AuthRefreshPanel`);
  if (!panel) {
    return;
  }
  if (!panel.hidden) {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => positionAuthRefreshPanel(prefix));
    } else {
      positionAuthRefreshPanel(prefix);
    }
  }
}

function bindAuthRefreshDisclosurePlacement() {
  for (const prefix of ['runner', 'performance']) {
    const panel = $(`${prefix}AuthRefreshPanel`);
    if (!panel) {
      continue;
    }
    for (const details of panel.querySelectorAll('.auth-refresh-refresh-token, .auth-refresh-advanced')) {
      if (details.dataset.authRefreshPlacementBound === 'true') {
        continue;
      }
      details.dataset.authRefreshPlacementBound = 'true';
      details.addEventListener('toggle', () => positionVisibleAuthRefreshPanel(prefix));
    }
  }
}

function syncAuthRefreshButton(prefix, authRefresh, enabled = true) {
  const button = $(`${prefix}AuthRefreshButton`);
  const active = enabled && authRefresh?.enabled === true;
  if (button) {
    button.textContent = `Refreshing Auth: ${active ? 'On' : 'Off'}`;
    button.classList.toggle('auth-refresh-active', active);
    button.disabled = !enabled;
  }
  const toggleButton = $(`${prefix}ToggleAuthRefreshButton`);
  if (toggleButton) {
    toggleButton.disabled = !enabled;
    toggleButton.textContent = authRefresh?.enabled === true ? 'Turn Off' : 'Turn On';
  }
  const editButton = $(`${prefix}EditAuthRefreshButton`);
  if (editButton) {
    editButton.disabled = !enabled;
  }
}

function collectAuthRefreshFromControls(prefix, fallback = {}) {
  const existing = normalizeAuthRefreshConfig(fallback || {});
  const authType = normalizeAuthRefreshUiType($(`${prefix}AuthRefreshTypeSelect`)?.value || existing.authType);
  const outputs = collectAuthRefreshOutputsFromControls(prefix, authType);
  const primaryOutput = authRefreshPrimaryOutput(authType, outputs);
  const next = normalizeAuthRefreshConfig({
    ...existing,
    enabled: existing.enabled === true,
    mode: 'interval',
    authType,
    targetScope: 'environment',
    apiKeyLocation: $(`${prefix}AuthRefreshApiKeyLocationSelect`)?.value || existing.apiKeyLocation || 'header',
    apiKeyName: $(`${prefix}AuthRefreshApiKeyNameInput`)?.value || existing.apiKeyName || 'X-API-Key',
    accessTokenVariable: primaryOutput?.variable || '',
    refreshTokenVariable: authType === 'bearer' || authType === 'cookie'
      ? ($(`${prefix}AuthRefreshRefreshTokenVariableInput`)?.value || '')
      : '',
    expiresAtVariable: '',
    accessTokenPath: primaryOutput?.path || '',
    refreshTokenPath: authType === 'bearer' || authType === 'cookie'
      ? ($(`${prefix}AuthRefreshRefreshTokenPathInput`)?.value || '')
      : '',
    expiresInPath: '',
    expiresAtPath: '',
    refreshWindowSeconds: existing.refreshWindowSeconds,
    tokenLifetimeSeconds: existing.tokenLifetimeSeconds,
    refreshIntervalSeconds: $(`${prefix}AuthRefreshIntervalSecondsInput`)?.value || existing.refreshIntervalSeconds,
    refreshBeforeRun: $(`${prefix}AuthRefreshBeforeRunInput`)?.checked === true,
    failurePolicy: $(`${prefix}AuthRefreshFailurePolicySelect`)?.value || existing.failurePolicy,
    outputs,
    request: existing.request,
    refreshTokenRequest: existing.refreshTokenRequest
  });
  renderAuthRefreshVariableSuggestions(prefix);
  applyAuthRefreshTypeVisibility(prefix, next.authType);
  positionVisibleAuthRefreshPanel(prefix);
  renderAuthRefreshRequestSummary(prefix, next.request);
  renderAuthRefreshTokenRequestSummary(prefix, next.refreshTokenRequest);
  syncVisibleRefreshingAuthTypeOptionsForOwner(prefix, next);
  return next;
}

function normalizeAuthRefreshUiType(value) {
  const text = String(value || '').trim();
  return ['bearer', 'apiKey', 'cookie', 'aws', 'custom'].includes(text) ? text : 'bearer';
}

function authRefreshDefaultOutput(slot) {
  const defaults = {
    accessToken: { slot: 'accessToken', source: 'body', path: 'access_token', variable: 'ACCESS_TOKEN' },
    refreshToken: { slot: 'refreshToken', source: 'body', path: 'refresh_token', variable: 'REFRESH_TOKEN' },
    apiKey: { slot: 'apiKey', source: 'body', path: 'api_key', variable: '' },
    cookie: { slot: 'cookie', source: 'cookie', path: '', variable: '' },
    awsAccessKey: { slot: 'awsAccessKey', source: 'body', path: 'credentials.accessKeyId', variable: 'AWS_ACCESS_KEY_ID' },
    awsSecretKey: { slot: 'awsSecretKey', source: 'body', path: 'credentials.secretAccessKey', variable: 'AWS_SECRET_ACCESS_KEY' },
    awsSessionToken: { slot: 'awsSessionToken', source: 'body', path: 'credentials.sessionToken', variable: 'AWS_SESSION_TOKEN' },
    custom: { slot: 'custom', source: 'body', path: 'token', variable: 'AUTH_VALUE' }
  };
  return { ...(defaults[slot] || defaults.custom) };
}

function authRefreshOutputForSlot(config = {}, slot, fallback = {}) {
  const output = (config.outputs || []).find((item) => item?.slot === slot);
  return {
    ...fallback,
    ...(output || {})
  };
}

function awsCredentialsOutputSource(outputs = []) {
  const preferred = normalizeAuthRefreshOutputSource(outputs.find((output) => output?.source)?.source, 'body');
  return preferred === 'rawBody' ? 'body' : preferred;
}

function normalizeAuthRefreshOutputSource(value, fallback = 'body') {
  const text = String(value || '').trim();
  if (AUTH_REFRESH_OUTPUT_SOURCE_VALUES.has(text)) {
    return text;
  }
  return AUTH_REFRESH_OUTPUT_SOURCE_VALUES.has(fallback) ? fallback : 'body';
}

function setAuthRefreshOutputControls(prefix, controlName, output = {}, authType = '') {
  const source = normalizeAuthRefreshOutputSource(output.source);
  if (!String(controlName || '').startsWith('Aws')) {
    setValue(`${prefix}AuthRefresh${controlName}SourceSelect`, source);
  }
  syncAuthRefreshOutputSourceField(
    prefix,
    controlName,
    String(controlName || '').startsWith('Aws') ? '' : source,
    authType
  );
}

function syncAuthRefreshOutputSourceFields(prefix, authType = '') {
  for (const controlName of Object.keys(AUTH_REFRESH_OUTPUT_PATH_LABELS)) {
    syncAuthRefreshOutputSourceField(prefix, controlName, '', authType);
  }
}

function syncAuthRefreshOutputSourceField(prefix, controlName, sourceOverride = '', authType = '') {
  const field = $(`${prefix}AuthRefresh${controlName}PathField`);
  const label = $(`${prefix}AuthRefresh${controlName}PathLabel`);
  const source = normalizeAuthRefreshOutputSource(
    sourceOverride || authRefreshOutputControlSource(prefix, controlName)
  );
  if (field) {
    field.hidden = source === 'rawBody';
  }
  if (label) {
    label.textContent = authRefreshOutputPathLabel(controlName, source, authType);
  }
}

function authRefreshOutputPathLabel(controlName, source, authType = '') {
  const labels = AUTH_REFRESH_OUTPUT_PATH_LABELS[controlName] || {};
  return labels[source] || labels.body || 'Response Path';
}

function collectAuthRefreshOutputsFromControls(prefix, authType) {
  if (authType === 'apiKey') {
    return [authRefreshOutputFromControls(prefix, 'apiKey', 'ApiKey', 'ApiKeyVariableInput', 'ApiKeyPathInput')];
  }
  if (authType === 'cookie') {
    return [
      authRefreshOutputFromControls(prefix, 'cookie', '', 'CookieVariableInput', 'CookieNameInput', 'cookie'),
      authRefreshOutputFromControls(prefix, 'refreshToken', 'RefreshToken', 'RefreshTokenVariableInput', 'RefreshTokenPathInput')
    ];
  }
  if (authType === 'aws') {
    return [
      authRefreshOutputFromControls(prefix, 'awsAccessKey', 'AwsAccessKey', 'AwsAccessKeyVariableInput', 'AwsAccessKeyPathInput'),
      authRefreshOutputFromControls(prefix, 'awsSecretKey', 'AwsSecretKey', 'AwsSecretKeyVariableInput', 'AwsSecretKeyPathInput'),
      authRefreshOutputFromControls(prefix, 'awsSessionToken', 'AwsSessionToken', 'AwsSessionTokenVariableInput', 'AwsSessionTokenPathInput')
    ];
  }
  if (authType === 'custom') {
    return [authRefreshOutputFromControls(prefix, 'custom', 'Custom', 'CustomVariableInput', 'CustomPathInput')];
  }
  return [
    authRefreshOutputFromControls(prefix, 'accessToken', 'AccessToken', 'AccessTokenVariableInput', 'AccessTokenPathInput'),
    authRefreshOutputFromControls(prefix, 'refreshToken', 'RefreshToken', 'RefreshTokenVariableInput', 'RefreshTokenPathInput')
  ];
}

function authRefreshOutputFromControls(prefix, slot, controlName, variableSuffix, pathSuffix, fallbackSource = '') {
  const fallback = authRefreshDefaultOutput(slot);
  const source = normalizeAuthRefreshOutputSource(
    controlName ? authRefreshOutputControlSource(prefix, controlName) : fallbackSource,
    fallbackSource || fallback.source
  );
  let path = source === 'rawBody'
    ? AUTH_REFRESH_RAW_BODY_PATH
    : ($(`${prefix}AuthRefresh${pathSuffix}`)?.value || fallback.path);
  if (source !== 'rawBody' && path === AUTH_REFRESH_RAW_BODY_PATH) {
    path = fallback.path;
  }
  return {
    slot,
    source,
    variable: $(`${prefix}AuthRefresh${variableSuffix}`)?.value || fallback.variable,
    path
  };
}

function authRefreshOutputControlSource(prefix, controlName) {
  const text = String(controlName || '');
  if (text.startsWith('Aws')) {
    return $(`${prefix}AuthRefreshAwsCredentialsSourceSelect`)?.value
      || $(`${prefix}AuthRefresh${controlName}SourceSelect`)?.value
      || '';
  }
  return $(`${prefix}AuthRefresh${controlName}SourceSelect`)?.value || '';
}

function authRefreshPrimaryOutput(authType, outputs = []) {
  const primarySlots = {
    bearer: 'accessToken',
    apiKey: 'apiKey',
    cookie: 'cookie',
    aws: 'awsAccessKey',
    custom: 'custom'
  };
  return outputs.find((output) => output?.slot === primarySlots[authType]) || outputs[0] || null;
}

function applyAuthRefreshTypeVisibility(prefix, authType) {
  const normalizedType = normalizeAuthRefreshUiType(authType);
  const panel = $(`${prefix}AuthRefreshPanel`);
  if (!panel) {
    return;
  }
  for (const section of panel.querySelectorAll('[data-auth-refresh-types]')) {
    const types = String(section.dataset.authRefreshTypes || '').split(/\s+/).filter(Boolean);
    section.hidden = Boolean(types.length) && !types.includes(normalizedType);
  }
  const labels = authRefreshTypeLabels(normalizedType);
  setText(`${prefix}AuthRefreshHelpText`, labels.help);
  setText(`${prefix}AuthRefreshAccessTokenVariableLabel`, labels.variableLabel);
  setText(`${prefix}AuthRefreshAccessTokenPathLabel`, labels.pathLabel);
  syncAuthRefreshOutputSourceFields(prefix, normalizedType);
}

function authRefreshTypeLabels(authType) {
  if (authType === 'apiKey') {
    return {
      variableLabel: '',
      pathLabel: 'API Key Response Path',
      help: 'The auth request uses this run environment, reads the API key, and applies it to matching API key requests.'
    };
  }
  if (authType === 'cookie') {
    return {
      variableLabel: 'Save Cookie Value To',
      pathLabel: 'Cookie Name',
      help: 'The auth request uses this run environment, reads the named response cookie, and automatically applies it to matching cookie requests.'
    };
  }
  if (authType === 'aws') {
    return {
      variableLabel: 'Save AWS Access Key ID To',
      pathLabel: 'AWS Access Key ID Response Path',
      help: 'The auth request uses this run environment and refreshes temporary AWS credentials on the interval below.'
    };
  }
  if (authType === 'custom') {
    return {
      variableLabel: 'Save Header Value To',
      pathLabel: 'Header Value Response Path',
      help: 'The auth request uses this run environment and saves a custom auth value to a variable.'
    };
  }
  return {
    variableLabel: 'Save Access Token To',
    pathLabel: 'Access Token Response Path',
    help: 'The auth request uses this run environment, reads the bearer token from the response path, and automatically applies it to matching bearer requests.'
  };
}

function renderAuthRefreshVariableSuggestions(prefix) {
  const list = $(`${prefix}AuthRefreshVariableList`);
  if (!list) {
    return;
  }
  const environment = activeEnvironment();
  list.textContent = '';
  const seen = new Set();
  for (const variable of environment?.variables || []) {
    const key = String(variable?.key || '').trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const option = document.createElement('option');
    option.value = key;
    list.append(option);
  }
}

function setPerformancePanelControlValue(panel, kind, name, value) {
  const attribute = kind === 'safety' ? 'data-performance-safety' : 'data-performance-config';
  for (const control of panel.querySelectorAll(`[${attribute}="${name}"]`)) {
    control.value = String(value);
  }
}

function setPerformanceControlsDisabled(kind, disabled) {
  const attribute = kind === 'safety' ? 'data-performance-safety' : 'data-performance-config';
  for (const control of document.querySelectorAll(`[${attribute}]`)) {
    control.disabled = disabled;
  }
}

function performanceTypeSettings(test, type) {
  const normalizedType = RENDERER_PERFORMANCE_TEST_TYPES.includes(type) ? type : 'diagnosis';
  const typeSettings = ensurePerformanceTypeSettings(test);
  return typeSettings[normalizedType] || ensurePerformanceTypeSettings(null)[normalizedType];
}

function ensurePerformanceTypeSettings(test) {
  if (!test) {
    return normalizePerformanceTypeSettings();
  }
  test.typeSettings = normalizePerformanceTypeSettings(test.typeSettings, test.type, {
    environmentId: test.environmentId,
    allowEnvironmentMutation: test.allowEnvironmentMutation,
    config: test.config,
    safetyLimits: test.safetyLimits
  }, workspace);
  return test.typeSettings;
}

function performanceTypeForElement(element) {
  const panel = element?.classList?.contains('performance-type-panel')
    ? element
    : element?.closest?.('.performance-type-panel');
  const type = String(panel?.id || '').replace(/Tab$/, '');
  return RENDERER_PERFORMANCE_TEST_TYPES.includes(type) ? type : '';
}

function renderRunnerRequestList(runner) {
  const root = $('runnerRequestList');
  root.textContent = '';
  if (!runner) {
    return;
  }
  runner.requests = normalizeRunnerRequests(runner.requests);
  if (!runner.requests.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state runner-request-empty';
    empty.textContent = 'No requests in this runner';
    root.append(empty);
    return;
  }
  runner.requests.forEach((request, index) => {
    root.append(runnerRequestRow(runner, request, index));
  });
}

function runnerRequestIsDirty(runnerId, requestId) {
  if (!runnerId || !requestId) {
    return false;
  }
  return (openRequestTabs || []).some((tab) => tab?.runnerId === runnerId
    && tab?.requestId === requestId
    && tab?.dirty === true);
}

function runnerRequestRow(runner, request, index) {
  const row = document.createElement('div');
  row.className = 'runner-request-row';
  row.draggable = true;
  row.dataset.runnerRequestIndex = String(index);
  const showRefreshingAuthToggle = runnerRefreshingAuthToggleVisible(runner);
  row.classList.toggle('has-refresh-auth-toggle', showRefreshingAuthToggle);

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'runner-row-handle';
  handle.textContent = '::';
  handle.title = 'Drag to reorder';
  handle.setAttribute('aria-label', `Reorder ${request.name || 'runner request'}`);

  const methodCell = document.createElement('span');
  methodCell.className = 'runner-row-method-cell';
  const dirtyIndicator = document.createElement('span');
  dirtyIndicator.className = 'runner-row-dirty-indicator';
  dirtyIndicator.title = 'Unsaved changes';
  dirtyIndicator.setAttribute('aria-label', 'Unsaved changes');
  dirtyIndicator.hidden = !runnerRequestIsDirty(runner.id, request.id);
  const method = document.createElement('span');
  method.className = `runner-row-method ${methodClassName(request.method || 'GET')}`;
  method.textContent = methodBadgeText(request.method || 'GET');
  methodCell.append(dirtyIndicator, method);

  const name = document.createElement('span');
  name.className = 'runner-row-name';
  name.textContent = request.name || 'Untitled Request';

  const url = document.createElement('span');
  url.className = 'runner-row-url';
  url.textContent = request.url || '';

  const refreshingAuthField = showRefreshingAuthToggle
    ? runnerRequestRefreshingAuthField(runner, request)
    : null;

  const iterationsField = document.createElement('label');
  iterationsField.className = 'runner-row-iterations';
  const iterationsLabel = document.createElement('span');
  iterationsLabel.textContent = 'Iterations';
  const iterationsInput = document.createElement('input');
  iterationsInput.type = 'number';
  iterationsInput.min = '1';
  iterationsInput.max = String(MAX_RUNNER_REQUEST_ITERATIONS);
  iterationsInput.step = '1';
  iterationsInput.value = String(normalizeRunnerRequestIterations(request.iterations));
  iterationsInput.setAttribute('aria-label', `Iterations for ${request.name || 'runner request'}`);
  const updateIterations = (options = {}) => {
    const previous = normalizeRunnerRequestIterations(request.iterations);
    const next = normalizeRunnerRequestIterations(iterationsInput.value);
    const raw = Number.parseInt(iterationsInput.value || '', 10);
    request.iterations = next;
    if (options.commit === true
      || (Number.isFinite(raw) && (raw < 1 || raw > MAX_RUNNER_REQUEST_ITERATIONS))) {
      iterationsInput.value = String(next);
    }
    renderCapturePolicyControls('runner', runner.capturePolicy, true);
    if (next !== previous) {
      markActiveRunnerDirty();
    }
  };
  iterationsInput.addEventListener('input', () => updateIterations());
  iterationsInput.addEventListener('change', () => updateIterations({ commit: true }));
  for (const eventName of ['click', 'mousedown', 'dragstart']) {
    iterationsInput.addEventListener(eventName, (event) => event.stopPropagation());
  }
  iterationsField.append(iterationsLabel, iterationsInput);

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.textContent = 'Edit';
  editButton.setAttribute('aria-label', `Edit ${request.name || 'request'} from runner`);
  editButton.addEventListener('click', () => editRunnerRequest(runner, request));

  const moveUp = document.createElement('button');
  moveUp.type = 'button';
  moveUp.textContent = 'Up';
  moveUp.disabled = index === 0;
  moveUp.setAttribute('aria-label', `Move ${request.name || 'request'} up`);
  moveUp.addEventListener('click', () => moveRunnerRequest(runner, index, index - 1));

  const moveDown = document.createElement('button');
  moveDown.type = 'button';
  moveDown.textContent = 'Down';
  moveDown.disabled = index >= runner.requests.length - 1;
  moveDown.setAttribute('aria-label', `Move ${request.name || 'request'} down`);
  moveDown.addEventListener('click', () => moveRunnerRequest(runner, index, index + 1));

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'danger-button';
  deleteButton.textContent = 'Delete';
  deleteButton.setAttribute('aria-label', `Delete ${request.name || 'request'} from runner`);
  deleteButton.addEventListener('click', () => deleteRunnerRequest(runner, index));

  row.addEventListener('dragstart', (event) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    row.classList.add('is-dragging');
  });
  row.addEventListener('dragend', () => row.classList.remove('is-dragging'));
  row.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  });
  row.addEventListener('drop', (event) => {
    event.preventDefault();
    const fromIndex = Number(event.dataTransfer.getData('text/plain'));
    if (Number.isInteger(fromIndex)) {
      moveRunnerRequest(runner, fromIndex, index);
    }
  });

  const rowChildren = [handle, methodCell, name, url];
  if (refreshingAuthField) {
    rowChildren.push(refreshingAuthField);
  }
  rowChildren.push(iterationsField, editButton, moveUp, moveDown, deleteButton);
  row.append(...rowChildren);
  return row;
}

function runnerRefreshingAuthToggleVisible(runner) {
  return runner?.authRefresh?.enabled === true
    && AUTO_REFRESH_SUPPORTED_AUTH_TYPES.has(String(runner.authRefresh.authType || '').trim());
}

function runnerRequestRefreshingAuthField(runner, request) {
  const field = document.createElement('label');
  field.className = 'runner-row-refresh-auth';
  const input = document.createElement('input');
  input.type = 'checkbox';
  const cookieMode = runnerAuthRefreshIsCookie(runner);
  input.checked = cookieMode
    ? request?.useRefreshingAuthCookie === true
    : request?.auth?.type === AUTO_REFRESH_AUTH_TYPE;
  const refreshType = String(runner?.authRefresh?.authType || '').trim();
  const label = cookieMode
    ? 'Use refreshing access cookie'
    : refreshType === 'apiKey'
      ? 'Use refreshing API key'
      : 'Use refreshing access token';
  input.setAttribute('aria-label', `${label} for ${request.name || 'runner request'}`);
  const text = document.createElement('span');
  text.textContent = label;
  input.addEventListener('change', () => setRunnerRequestRefreshingAccessToken(runner, request, input.checked));
  for (const eventName of ['click', 'mousedown', 'dragstart']) {
    input.addEventListener(eventName, (event) => event.stopPropagation());
  }
  field.append(input, text);
  return field;
}

function setRunnerRequestRefreshingAccessToken(runner, request, enabled) {
  if (!runner || !request) {
    return false;
  }
  const target = (runner.requests || []).find((candidate) => candidate?.id === request.id) || request;
  if (runnerAuthRefreshIsCookie(runner)) {
    if (enabled === true) {
      if (target.useRefreshingAuthCookie !== true) {
        target.refreshingAuthOriginalAuth = normalizeRefreshingAuthOriginalAuth(target.auth);
      }
      target.auth = { type: 'none' };
      target.cookieJar = {
        ...(target.cookieJar || {}),
        enabled: true,
        storeResponses: true
      };
      target.useRefreshingAuthCookie = true;
    } else {
      const restoredAuth = normalizeRefreshingAuthOriginalAuth(target.refreshingAuthOriginalAuth);
      target.auth = restoredAuth;
      delete target.refreshingAuthOriginalAuth;
      delete target.useRefreshingAuthCookie;
    }
    markActiveRunnerDirty();
    renderRunnerEditor();
    renderRequestTabs();
    return true;
  }
  if (enabled === true) {
    if (target.auth?.type !== AUTO_REFRESH_AUTH_TYPE) {
      target.refreshingAuthOriginalAuth = normalizeRefreshingAuthOriginalAuth(target.auth);
    }
    target.auth = { type: AUTO_REFRESH_AUTH_TYPE };
  } else {
    const restoredAuth = normalizeRefreshingAuthOriginalAuth(target.refreshingAuthOriginalAuth);
    target.auth = restoredAuth;
    delete target.refreshingAuthOriginalAuth;
  }
  markActiveRunnerDirty();
  renderRunnerEditor();
  renderRequestTabs();
  return true;
}

function runnerAuthRefreshIsCookie(runner) {
  return String(runner?.authRefresh?.authType || '').trim() === 'cookie';
}

function normalizeRefreshingAuthOriginalAuth(auth = {}) {
  const normalized = window.PostMeterAuthModel.normalizePersistedAuth(cloneJson(auth) || { type: 'none' });
  if (normalized.type === AUTO_REFRESH_AUTH_TYPE || normalized.type === AUTO_REFRESH_REFRESH_TOKEN_AUTH_TYPE) {
    return { type: 'none' };
  }
  return normalized;
}

function showAddRunnerRequestMenu(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const runner = activeRunner();
  if (!runner) {
    return;
  }
  const trigger = $('addRunnerRequestButton');
  const rect = trigger.getBoundingClientRect();
  const items = [
    ['New Request', () => addNewRunnerLocalRequest()],
    ['Import', () => { void promptAndImportRunnerRequests(); }]
  ];
  showContextMenu(event?.clientX || rect.left, event?.clientY || rect.bottom + 4, items, {
    trigger,
    focusFirst: event?.detail === 0
  });
}

async function promptAndImportRunnerRequests() {
  const target = await promptRunnerRequestImport({ mode: 'runner' });
  if (!target) {
    return null;
  }
  return importRunnerSelection(target);
}

function promptRunnerRequestImport(options = {}) {
  runnerImportSelectionMode = options.mode === 'performance' ? 'performance' : 'runner';
  selectedRunnerImportTarget = [];
  expandedRunnerImportNodeKeys = [];
  lastRunnerImportSelectionKey = '';
  const collections = workspace.collections || [];
  const performanceMode = runnerImportSelectionMode === 'performance';
  $('runnerImportTitle').textContent = performanceMode ? 'Import request' : 'Import requests';
  $('confirmRunnerImportButton').textContent = performanceMode ? 'Import' : 'Add';
  $('runnerImportMessage').textContent = collections.length
    ? performanceMode
      ? 'Expand collections and folders, then select one request to use for this performance test.'
      : 'Expand collections and folders, then select requests, folders, or collections to add to this runner.'
    : 'There are no collections to import from.';
  renderRunnerImportList(collections);
  return showModal('runnerImportModal', null);
}

function renderRunnerImportList(collections = workspace.collections || []) {
  const list = $('runnerImportList');
  list.textContent = '';
  $('confirmRunnerImportButton').disabled = !selectedRunnerImportTargets().length;
  const availableCollections = Array.isArray(collections) ? collections : [];
  if (!availableCollections.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'There are no collections to import from.';
    list.append(empty);
    return;
  }
  for (const collection of availableCollections) {
    appendRunnerImportCollectionNode(list, collection);
  }
}

function appendRunnerImportCollectionNode(list, collection) {
  const target = {
    type: 'collection',
    collectionId: collection?.id || ''
  };
  const entries = collectionRequestEntries(collection);
  const expanded = runnerImportNodeExpanded(target);
  list.append(runnerImportGroupOption({
    ...target,
    label: collection?.name || 'Untitled Collection',
    meta: `${entries.length} request${entries.length === 1 ? '' : 's'}`,
    depth: 0,
    expanded,
    hasChildren: runnerImportContainerHasChildren(collection),
    requestTargets: entries.map(runnerImportTargetFromEntry)
  }));
  if (!expanded) {
    return;
  }
  for (const request of collection?.requests || []) {
    list.append(runnerImportRequestOption({
      type: 'request',
      collectionId: collection?.id || '',
      folderId: '',
      requestId: request?.id || '',
      label: request?.name || 'Untitled Request',
      meta: `${request?.method || 'GET'} ${request?.url || ''}`.trim(),
      depth: 1,
      checked: runnerImportTargetSelected({
        type: 'request',
        collectionId: collection?.id || '',
        requestId: request?.id || '',
        folderId: ''
      })
    }));
  }
  for (const folder of collection?.folders || []) {
    appendRunnerImportFolderNode(list, collection, folder, 1, []);
  }
}

function appendRunnerImportFolderNode(list, collection, folder, depth, parentPath) {
  const folderPath = [...parentPath, folder?.name || 'Untitled Folder'];
  const entries = runnerImportFolderRequestEntries(collection, folder, parentPath);
  const target = {
    type: 'folder',
    collectionId: collection?.id || '',
    folderId: folder?.id || ''
  };
  const expanded = runnerImportNodeExpanded(target);
  list.append(runnerImportGroupOption({
    ...target,
    label: folder?.name || 'Untitled Folder',
    meta: `${entries.length} request${entries.length === 1 ? '' : 's'}`,
    depth,
    expanded,
    hasChildren: runnerImportContainerHasChildren(folder),
    requestTargets: entries.map(runnerImportTargetFromEntry)
  }));
  if (!expanded) {
    return;
  }
  for (const request of folder?.requests || []) {
    list.append(runnerImportRequestOption({
      type: 'request',
      collectionId: collection?.id || '',
      folderId: folder?.id || '',
      requestId: request?.id || '',
      label: request?.name || 'Untitled Request',
      meta: `${request?.method || 'GET'} ${request?.url || ''}`.trim(),
      depth: depth + 1,
      checked: runnerImportTargetSelected({
        type: 'request',
        collectionId: collection?.id || '',
        folderId: folder?.id || '',
        requestId: request?.id || ''
      })
    }));
  }
  for (const child of folder?.folders || []) {
    appendRunnerImportFolderNode(list, collection, child, depth + 1, folderPath);
  }
}

function runnerImportGroupOption(option) {
  const row = document.createElement('div');
  row.className = `collection-pick-option runner-import-option ${option.type}`;
  row.dataset.runnerImportType = option.type;
  row.dataset.collectionId = option.collectionId || '';
  if (option.folderId) {
    row.dataset.folderId = option.folderId;
  }
  row.style.setProperty('--runner-import-depth-offset', `${Math.max(0, option.depth || 0) * 22}px`);
  row.setAttribute('aria-expanded', option.hasChildren ? (option.expanded ? 'true' : 'false') : 'false');
  row.addEventListener('click', (event) => {
    if (!option.hasChildren) {
      return;
    }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) {
      return;
    }
    toggleRunnerImportNodeExpansion(option);
  });

  const expander = document.createElement('button');
  expander.type = 'button';
  expander.className = 'runner-import-expander';
  expander.textContent = option.hasChildren ? (option.expanded ? 'v' : '>') : '';
  expander.disabled = !option.hasChildren;
  expander.setAttribute('aria-label', `${option.expanded ? 'Collapse' : 'Expand'} ${option.label}`);
  expander.setAttribute('aria-expanded', option.hasChildren ? (option.expanded ? 'true' : 'false') : 'false');
  expander.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleRunnerImportNodeExpansion(option);
  });
  row.append(expander);

  if (runnerImportSelectionMode === 'runner') {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'runnerImportTarget';
    input.dataset.runnerImportType = option.type;
    input.dataset.collectionId = option.collectionId || '';
    input.dataset.folderId = option.folderId || '';
    input.dataset.requestId = '';
    input.dataset.runnerImportKey = runnerImportTargetKey(option);
    const selectionState = runnerImportSelectionState(option.requestTargets);
    input.checked = selectionState === 'checked';
    input.indeterminate = selectionState === 'mixed';
    input.disabled = !option.requestTargets?.length;
    input.setAttribute('aria-label', `Select ${option.label}`);
    input.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setRunnerImportGroupChecked(option, selectionState !== 'checked');
    });
    input.addEventListener('change', () => {
      setRunnerImportGroupChecked(option, input.checked);
    });
    row.append(input);
  }

  const text = document.createElement('span');
  text.className = 'runner-import-label-text';
  text.textContent = option.label;
  if (option.meta) {
    const meta = document.createElement('span');
    meta.className = 'runner-import-meta';
    meta.textContent = option.meta;
    text.append(meta);
  }
  row.append(text);
  return row;
}

function runnerImportRequestOption(option) {
  const label = document.createElement('label');
  label.className = 'collection-pick-option runner-import-option request';
  label.dataset.runnerImportType = 'request';
  label.dataset.collectionId = option.collectionId || '';
  label.dataset.folderId = option.folderId || '';
  label.dataset.requestId = option.requestId || '';
  label.dataset.runnerImportKey = runnerImportTargetKey(option);
  label.style.setProperty('--runner-import-depth-offset', `${Math.max(0, option.depth || 0) * 22}px`);
  const input = document.createElement('input');
  input.type = runnerImportSelectionMode === 'performance' ? 'radio' : 'checkbox';
  input.name = 'runnerImportTarget';
  input.dataset.runnerImportType = 'request';
  input.dataset.collectionId = option.collectionId || '';
  input.dataset.folderId = option.folderId || '';
  input.dataset.requestId = option.requestId || '';
  input.dataset.runnerImportKey = runnerImportTargetKey(option);
  input.checked = option.checked === true;
  input.addEventListener('click', (event) => {
    event.preventDefault();
    updateRunnerImportSelection(runnerImportTargetFromInput(input), {
      shiftKey: event.shiftKey === true
    });
  });
  input.addEventListener('change', () => {
    setRunnerImportTargetChecked(runnerImportTargetFromInput(input), input.checked);
  });
  label.addEventListener('click', (event) => {
    if (event.target === input) {
      return;
    }
    event.preventDefault();
    updateRunnerImportSelection({
      type: 'request',
      collectionId: option.collectionId,
      folderId: option.folderId,
      requestId: option.requestId
    }, {
      shiftKey: event.shiftKey === true
    });
  });
  const text = document.createElement('span');
  text.className = 'runner-import-label-text';
  text.textContent = option.label;
  if (option.meta) {
    const meta = document.createElement('span');
    meta.className = 'runner-import-meta';
    meta.textContent = option.meta;
    text.append(meta);
  }
  label.append(input, text);
  return label;
}

function selectedRunnerImportTargets() {
  if (Array.isArray(selectedRunnerImportTarget)) {
    return selectedRunnerImportTarget.filter((target) => target?.type === 'request' && target.collectionId && target.requestId);
  }
  return selectedRunnerImportTarget?.type === 'request' && selectedRunnerImportTarget.collectionId && selectedRunnerImportTarget.requestId
    ? [selectedRunnerImportTarget]
    : [];
}

function setSelectedRunnerImportTargets(targets) {
  const uniqueTargets = [];
  const seen = new Set();
  for (const target of Array.isArray(targets) ? targets : []) {
    const normalized = normalizeRunnerImportTarget(target);
    const key = runnerImportTargetKey(normalized);
    if (normalized.type !== 'request' || !normalized.collectionId || !normalized.requestId || seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueTargets.push(normalized);
  }
  const selectedTargets = runnerImportSelectionMode === 'performance'
    ? uniqueTargets.slice(-1)
    : uniqueTargets;
  selectedRunnerImportTarget = selectedTargets;
  $('confirmRunnerImportButton').disabled = !selectedTargets.length;
}

function normalizeRunnerImportTarget(target = {}) {
  const type = target.type === 'collection' || target.type === 'folder' || target.type === 'request'
    ? target.type
    : 'request';
  return {
    type,
    collectionId: target.collectionId || '',
    folderId: type === 'collection' ? '' : target.folderId || '',
    requestId: type === 'request' ? target.requestId || '' : ''
  };
}

function runnerImportTargetKey(target = {}) {
  const normalized = normalizeRunnerImportTarget(target);
  return `${normalized.type}:${normalized.collectionId}:${normalized.folderId}:${normalized.requestId}`;
}

function runnerImportTargetSelected(target) {
  const key = runnerImportTargetKey(target);
  return selectedRunnerImportTargets().some((selected) => runnerImportTargetKey(selected) === key);
}

function runnerImportTargetFromInput(input) {
  return {
    type: input.dataset.runnerImportType,
    collectionId: input.dataset.collectionId || '',
    folderId: input.dataset.folderId || '',
    requestId: input.dataset.requestId || ''
  };
}

function updateRunnerImportSelection(target, options = {}) {
  const normalized = normalizeRunnerImportTarget(target);
  if (!normalized.collectionId) {
    return;
  }
  if (normalized.type !== 'request') {
    toggleRunnerImportNodeExpansion(normalized);
    return;
  }
  let nextTargets = selectedRunnerImportTargets();
  if (runnerImportSelectionMode === 'performance') {
    nextTargets = [normalized];
  } else if (options.shiftKey && lastRunnerImportSelectionKey) {
    const visibleTargets = visibleRunnerImportTargets();
    const keys = visibleTargets.map(runnerImportTargetKey);
    const anchorIndex = keys.indexOf(lastRunnerImportSelectionKey);
    const targetIndex = keys.indexOf(runnerImportTargetKey(normalized));
    if (anchorIndex >= 0 && targetIndex >= 0) {
      const [from, to] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
      nextTargets = [...nextTargets, ...visibleTargets.slice(from, to + 1)];
    } else {
      nextTargets = toggleRunnerImportTarget(nextTargets, normalized);
    }
  } else {
    nextTargets = toggleRunnerImportTarget(nextTargets, normalized);
  }
  lastRunnerImportSelectionKey = runnerImportTargetKey(normalized);
  setSelectedRunnerImportTargets(nextTargets);
  renderRunnerImportList();
}

function setRunnerImportTargetChecked(target, checked) {
  const normalized = normalizeRunnerImportTarget(target);
  if (normalized.type !== 'request' || !normalized.collectionId || !normalized.requestId) {
    return;
  }
  const existing = selectedRunnerImportTargets()
    .filter((selected) => runnerImportTargetKey(selected) !== runnerImportTargetKey(normalized));
  if (checked) {
    existing.push(normalized);
  }
  lastRunnerImportSelectionKey = runnerImportTargetKey(normalized);
  setSelectedRunnerImportTargets(existing);
  renderRunnerImportList();
}

function toggleRunnerImportTarget(targets, target) {
  const key = runnerImportTargetKey(target);
  if (targets.some((selected) => runnerImportTargetKey(selected) === key)) {
    return targets.filter((selected) => runnerImportTargetKey(selected) !== key);
  }
  return [...targets, target];
}

function visibleRunnerImportTargets() {
  return Array.from($('runnerImportList').querySelectorAll('input[data-runner-import-key][data-runner-import-type="request"]'))
    .map(runnerImportTargetFromInput);
}

function expandRunnerImportCollection(collectionId) {
  expandRunnerImportNode({ type: 'collection', collectionId });
}

function toggleRunnerImportCollectionExpansion(collectionId) {
  toggleRunnerImportNodeExpansion({ type: 'collection', collectionId });
}

function runnerImportNodeKey(target = {}) {
  const normalized = normalizeRunnerImportTarget(target);
  return `${normalized.type}:${normalized.collectionId}:${normalized.folderId}`;
}

function runnerImportNodeExpanded(target = {}) {
  return expandedRunnerImportNodeKeys.includes(runnerImportNodeKey(target));
}

function expandRunnerImportNode(target = {}) {
  const key = runnerImportNodeKey(target);
  if (!target?.collectionId || expandedRunnerImportNodeKeys.includes(key)) {
    return;
  }
  expandedRunnerImportNodeKeys = [...expandedRunnerImportNodeKeys, key];
}

function toggleRunnerImportNodeExpansion(target = {}) {
  if (!target?.collectionId) {
    return;
  }
  const key = runnerImportNodeKey(target);
  expandedRunnerImportNodeKeys = expandedRunnerImportNodeKeys.includes(key)
    ? expandedRunnerImportNodeKeys.filter((id) => id !== key)
    : [...expandedRunnerImportNodeKeys, key];
  renderRunnerImportList();
}

function runnerImportSelectionState(targets = []) {
  const requestTargets = Array.isArray(targets) ? targets.filter((target) => target?.type === 'request') : [];
  if (!requestTargets.length) {
    return 'unchecked';
  }
  const selectedKeys = new Set(selectedRunnerImportTargets().map(runnerImportTargetKey));
  const selectedCount = requestTargets.filter((target) => selectedKeys.has(runnerImportTargetKey(target))).length;
  if (selectedCount === requestTargets.length) {
    return 'checked';
  }
  return selectedCount > 0 ? 'mixed' : 'unchecked';
}

function setRunnerImportGroupChecked(option = {}, checked) {
  if (runnerImportSelectionMode !== 'runner') {
    return;
  }
  const requestTargets = Array.isArray(option.requestTargets)
    ? option.requestTargets.filter((target) => target?.type === 'request')
    : runnerImportRequestTargetsForNode(option);
  if (!requestTargets.length) {
    return;
  }
  const descendantKeys = new Set(requestTargets.map(runnerImportTargetKey));
  const nextTargets = selectedRunnerImportTargets()
    .filter((selected) => !descendantKeys.has(runnerImportTargetKey(selected)));
  if (checked) {
    nextTargets.push(...requestTargets);
  }
  lastRunnerImportSelectionKey = requestTargets.length ? runnerImportTargetKey(requestTargets.at(-1)) : '';
  setSelectedRunnerImportTargets(nextTargets);
  renderRunnerImportList();
}

function runnerImportRequestTargetsForNode(target = {}) {
  const normalized = normalizeRunnerImportTarget(target);
  const collection = (workspace.collections || []).find((item) => item.id === normalized.collectionId);
  if (!collection) {
    return [];
  }
  if (normalized.type === 'request') {
    return [normalized];
  }
  if (normalized.type === 'collection') {
    return collectionRequestEntries(collection).map(runnerImportTargetFromEntry);
  }
  const folder = findRunnerImportFolder(collection, normalized.folderId);
  return runnerImportFolderRequestEntries(collection, folder).map(runnerImportTargetFromEntry);
}

function runnerImportTargetFromEntry(entry = {}) {
  return {
    type: 'request',
    collectionId: entry.collection?.id || '',
    folderId: entry.folder?.id || '',
    requestId: entry.request?.id || ''
  };
}

function runnerImportFolderRequestEntries(collection, folder, parentPath = []) {
  const entries = [];
  if (!folder) {
    return entries;
  }
  const folderPath = [...parentPath, folder.name || 'Untitled Folder'];
  for (const request of folder.requests || []) {
    entries.push({ collection, request, folder, folderPath });
  }
  for (const child of folder.folders || []) {
    entries.push(...runnerImportFolderRequestEntries(collection, child, folderPath));
  }
  return entries;
}

function findRunnerImportFolder(collection, folderId) {
  if (!folderId) {
    return null;
  }
  const stack = [...(collection?.folders || [])];
  while (stack.length) {
    const folder = stack.shift();
    if (folder?.id === folderId) {
      return folder;
    }
    stack.unshift(...(folder?.folders || []));
  }
  return null;
}

function runnerImportContainerHasChildren(container) {
  return Boolean(container?.requests?.length || container?.folders?.length);
}

function importRunnerSelection(target) {
  const targets = Array.isArray(target)
    ? target
    : target?.collectionId
      ? [target]
      : selectedRunnerImportTargets();
  if (targets.length) {
    return importRunnerSelections(targets);
  }
  return null;
}

function importRunnerSelections(targets) {
  const runner = activeRunner();
  if (!runner) {
    return null;
  }
  const entries = [];
  const seenRequests = new Set();
  const requestTargets = expandRunnerImportTargets(targets);
  for (const target of requestTargets.map(normalizeRunnerImportTarget)) {
    if (target.type !== 'request' || !target.requestId) {
      continue;
    }
    const collection = (workspace.collections || []).find((item) => item.id === target.collectionId);
    if (!collection) {
      continue;
    }
    const collectionEntries = collectionRequestEntries(collection);
    const selectedEntries = collectionEntries.filter((entry) => entry.request?.id === target.requestId
      && (!target.folderId || entry.folder?.id === target.folderId));
    for (const entry of selectedEntries) {
      const requestKey = `${collection.id}:${entry.folder?.id || 'root'}:${entry.request?.id || ''}`;
      if (!entry.request || seenRequests.has(requestKey)) {
        continue;
      }
      seenRequests.add(requestKey);
      entries.push(entry);
    }
  }
  if (!entries.length) {
    setStatus('No runner requests were selected to import.');
    return 0;
  }
  const imported = entries.map((entry) => cloneRequestForRunner(entry.request, runnerRequestSourceFromEntry(entry)));
  runner.requests = [...normalizeRunnerRequests(runner.requests), ...imported];
  markActiveRunnerDirty();
  renderRunnerEditor();
  setStatus(`${imported.length} request${imported.length === 1 ? '' : 's'} imported into runner.`);
  return imported.length;
}

function expandRunnerImportTargets(targets = []) {
  const expanded = [];
  for (const target of Array.isArray(targets) ? targets : []) {
    const normalized = normalizeRunnerImportTarget(target);
    if (normalized.type === 'request') {
      expanded.push(normalized);
      continue;
    }
    expanded.push(...runnerImportRequestTargetsForNode(normalized));
  }
  return expanded;
}

async function promptAndImportPerformanceRequest() {
  const target = await promptRunnerRequestImport({ mode: 'performance' });
  if (!target) {
    return null;
  }
  return importPerformanceRequestSelection(Array.isArray(target) ? target[0] : target);
}

function openNewAuthRefreshRequest(ownerType, requestKind = 'access') {
  const owner = activeAuthRefreshOwnerForType(ownerType);
  if (!owner) {
    return null;
  }
  collectActiveEditorState();
  const property = authRefreshRequestProperty(requestKind);
  owner.authRefresh = normalizeAuthRefreshConfig({
    ...(owner.authRefresh || {}),
    [property]: newAuthRefreshRequest(requestKind)
  });
  if (requestKind === 'refreshToken' || requestKind === 'access') {
    autoSelectRefreshingAuthRefreshTokenForAccessRequest(ownerType, owner);
  }
  markAuthRefreshOwnerDirty(ownerType);
  renderAuthRefreshControls(ownerType, owner.authRefresh, true);
  return openAuthRefreshRequest(ownerType, owner, `${authRefreshRequestLabel(requestKind)} created.`, requestKind);
}

async function promptAndImportAuthRefreshRequest(ownerType, requestKind = 'access') {
  const target = await promptRunnerRequestImport({ mode: 'performance' });
  if (!target) {
    return null;
  }
  return importAuthRefreshRequestSelection(ownerType, Array.isArray(target) ? target[0] : target, requestKind);
}

function importAuthRefreshRequestSelection(ownerType, target, requestKind = 'access') {
  const owner = activeAuthRefreshOwnerForType(ownerType);
  const normalized = normalizeRunnerImportTarget(target);
  if (!owner || normalized.type !== 'request' || !normalized.collectionId || !normalized.requestId) {
    return null;
  }
  const collection = (workspace.collections || []).find((item) => item.id === normalized.collectionId);
  const entry = collectionRequestEntries(collection).find((candidate) => candidate.request?.id === normalized.requestId
    && (!normalized.folderId || candidate.folder?.id === normalized.folderId));
  if (!entry?.request) {
    setStatus('No request was selected to import.');
    return null;
  }
  const property = authRefreshRequestProperty(requestKind);
  owner.authRefresh = normalizeAuthRefreshConfig({
    ...(owner.authRefresh || {}),
    [property]: cloneRequestForAuthRefresh(entry.request, requestKind)
  });
  if (requestKind === 'refreshToken' || requestKind === 'access') {
    autoSelectRefreshingAuthRefreshTokenForAccessRequest(ownerType, owner);
  }
  markAuthRefreshOwnerDirty(ownerType);
  renderAuthRefreshControls(ownerType, owner.authRefresh, true);
  setStatus(`${authRefreshRequestLabel(requestKind)} imported into refreshing auth.`);
  return openAuthRefreshRequest(ownerType, owner, `Opened ${authRefreshRequestLabel(requestKind).toLowerCase()} for editing.`, requestKind);
}

function openExistingAuthRefreshRequest(ownerType, requestKind = 'access') {
  const owner = activeAuthRefreshOwnerForType(ownerType);
  if (!owner) {
    return null;
  }
  collectActiveEditorState();
  const request = owner.authRefresh?.[authRefreshRequestProperty(requestKind)] || null;
  if (!authRefreshRequestConfigured(request)) {
    setStatus(`Create or import ${authRefreshRequestArticle(requestKind)} ${authRefreshRequestLabel(requestKind).toLowerCase()} first.`);
    renderAuthRefreshControls(ownerType, owner.authRefresh, true);
    return null;
  }
  return openAuthRefreshRequest(ownerType, owner, `Opened ${authRefreshRequestLabel(requestKind).toLowerCase()} for editing.`, requestKind);
}

function removeAuthRefreshRequest(ownerType, requestKind = 'access') {
  const owner = activeAuthRefreshOwnerForType(ownerType);
  if (!owner) {
    return false;
  }
  collectActiveEditorState();
  const property = authRefreshRequestProperty(requestKind);
  const request = owner.authRefresh?.[property] || null;
  if (!authRefreshRequestConfigured(request)) {
    renderAuthRefreshControls(ownerType, owner.authRefresh, true);
    setStatus(`No ${authRefreshRequestLabel(requestKind).toLowerCase()} selected.`);
    return false;
  }
  const requestId = String(request.id || '').trim();
  owner.authRefresh = normalizeAuthRefreshConfig({
    ...(owner.authRefresh || {}),
    [property]: {}
  });
  if (requestKind === 'refreshToken' && owner.authRefresh.request?.auth?.type === AUTO_REFRESH_REFRESH_TOKEN_AUTH_TYPE) {
    owner.authRefresh.request.auth = { type: 'none' };
  }
  if (requestKind === 'refreshToken' && owner.authRefresh.request?.useRefreshingAuthCookie === true) {
    owner.authRefresh.request.auth = normalizeRefreshingAuthOriginalAuth(owner.authRefresh.request.refreshingAuthOriginalAuth);
    delete owner.authRefresh.request.refreshingAuthOriginalAuth;
    delete owner.authRefresh.request.useRefreshingAuthCookie;
  }
  markAuthRefreshOwnerDirty(ownerType);
  removeOpenAuthRefreshRequestTab(ownerType, owner.id, requestId);
  const wasActiveRequest = activeAuthRefreshRequestOwnerType === ownerType
    && activeAuthRefreshRequestOwnerId === owner.id
    && activeRequestId === requestId;
  if (wasActiveRequest) {
    activeCollectionId = null;
    activeFolderId = null;
    activeRequestId = null;
    activeRunnerRequestRunnerId = null;
    activeAuthRefreshRequestOwnerType = '';
    activeAuthRefreshRequestOwnerId = null;
    if (ownerType === 'runner') {
      activeRunnerConfigId = owner.id;
      activeSidebarPanel = 'runners';
      activeMainPanel = 'runner';
    } else {
      activePerformanceTestId = owner.id;
      activeSidebarPanel = 'performance';
      activeMainPanel = 'performance';
    }
  }
  closeToolbarMenus();
  renderAll();
  setStatus(`${authRefreshRequestLabel(requestKind)} removed.`);
  return true;
}

function removeOpenAuthRefreshRequestTab(ownerType, ownerId, requestId) {
  if (!ownerType || !ownerId || !requestId) {
    return;
  }
  removeOpenRequestTab(`auth-request:${ownerType}:${ownerId}:${requestId}`);
}

async function autoDetectAuthRefreshRequest(ownerType, requestKind = 'access') {
  try {
    collectActiveEditorState();
    const owner = activeAuthRefreshOwnerForType(ownerType);
    if (!owner) {
      return null;
    }
    const property = authRefreshRequestProperty(requestKind);
    const request = owner.authRefresh?.[property] || null;
    if (!authRefreshRequestConfigured(request)) {
      setStatus(`Create or import ${authRefreshRequestArticle(requestKind)} ${authRefreshRequestLabel(requestKind).toLowerCase()} first.`);
      renderAuthRefreshControls(ownerType, owner.authRefresh, true);
      return null;
    }
    const target = authRefreshAutoDetectTarget(ownerType, requestKind, owner.authRefresh);
    if (!target) {
      setStatus('Auto-Detect is not available for this refreshing auth type.');
      return null;
    }
    const sendRequest = window.__postmeterSendRequest || window.postmeter?.request?.send;
    if (typeof sendRequest !== 'function') {
      setStatus('Auto-Detect is unavailable in this runtime.');
      return null;
    }
    const autoDetectModel = window.PostMeterAuthRefreshAutoDetectModel;
    if (typeof autoDetectModel?.buildAuthRefreshAutoDetectCandidates !== 'function') {
      setStatus('Auto-Detect response parsing is unavailable.');
      return null;
    }
    setStatus(`Auto-detecting ${authRefreshRequestLabel(requestKind).toLowerCase()} response...`);
    const response = await sendAuthRefreshAutoDetectRequest(sendRequest, owner.authRefresh || {}, requestKind, request, authRefreshAutoDetectEnvironment(ownerType, owner));
    const candidates = autoDetectModel.buildAuthRefreshAutoDetectCandidates(response)
      .map((candidate) => ({
        ...candidate,
        compatible: target.allowedSources.includes(candidate.source)
      }));
    const selected = await promptAuthRefreshAutoDetect(candidates, target);
    if (!selected) {
      setStatus('Auto-Detect cancelled.');
      return null;
    }
    if (applyAuthRefreshAutoDetectCandidate(ownerType, requestKind, selected, target)) {
      setStatus(`Auto-Detect set ${target.label} from ${authRefreshAutoDetectCandidateSummary(selected)}.`);
    }
    return selected;
  } catch (error) {
    const message = error?.message || String(error);
    setStatus(`Auto-Detect failed: ${message}`);
    notifyUser('Auto-Detect Failed', message);
    return null;
  }
}

async function sendAuthRefreshAutoDetectRequest(sendRequest, authRefresh, requestKind, request, environment) {
  const environmentSnapshot = cloneJson(environment);
  const cookieRefreshTokenAuth = String(authRefresh?.authType || '').trim() === 'cookie'
    && request?.useRefreshingAuthCookie === true;
  if (requestKind !== 'access'
    || (request?.auth?.type !== AUTO_REFRESH_REFRESH_TOKEN_AUTH_TYPE && !cookieRefreshTokenAuth)) {
    return sendRequest(cloneJson(request) || request, environmentSnapshot);
  }
  const refreshRequest = authRefresh?.refreshTokenRequest || null;
  if (!authRefreshRequestConfigured(refreshRequest)) {
    throw new Error('Auto-Detect needs a refresh token request before it can run this access-token request.');
  }
  const refreshResponse = await sendRequest(cloneJson(refreshRequest) || refreshRequest, cloneJson(environment));
  const refreshToken = extractAuthRefreshAutoDetectRefreshToken(authRefresh, refreshResponse);
  if (!refreshToken) {
    const refreshOutput = authRefreshAutoDetectRefreshTokenOutput(authRefresh);
    throw new Error(`Auto-Detect could not read a refresh token from ${authRefreshOutputDescription(refreshOutput)}.`);
  }
  if (cookieRefreshTokenAuth) {
    upsertAuthRefreshAutoDetectCookie(request, authRefreshRefreshCookieName(authRefresh), refreshToken);
    return sendRequest({
      ...(cloneJson(request) || request),
      auth: { type: 'none' },
      cookieJar: {
        ...(request.cookieJar || {}),
        enabled: true,
        storeResponses: true
      }
    }, environmentSnapshot);
  }
  return sendRequest({
    ...(cloneJson(request) || request),
    auth: authRefreshAutoDetectRefreshTokenAuth(authRefresh, refreshToken)
  }, environmentSnapshot);
}

function upsertAuthRefreshAutoDetectCookie(request = {}, name = '', value = '') {
  const cookieName = String(name || '').trim();
  const domain = domainFromRequestUrl(request?.url || '');
  if (!cookieName || !domain) {
    return;
  }
  workspace.cookies ||= [];
  const existing = workspace.cookies.find((cookie) => String(cookie?.name || '').trim() === cookieName
    && rendererCookieMatchesHost(cookie, domain));
  if (existing) {
    existing.enabled = true;
    existing.value = String(value ?? '');
    return;
  }
  workspace.cookies.push(newWorkspaceCookie({
    name: cookieName,
    value: String(value ?? ''),
    domain,
    path: '/',
    hostOnly: true,
    httpOnly: true,
    sameSite: 'Lax',
    source: 'auth-refresh'
  }));
}

function authRefreshAutoDetectRefreshTokenAuth(authRefresh = {}, refreshToken = '') {
  if (String(authRefresh.authType || '').trim() === 'cookie') {
    return {
      type: 'cookie',
      value: `${authRefreshRefreshTokenCookieName(authRefresh)}=${refreshToken}`
    };
  }
  return { type: 'bearer', token: refreshToken };
}

function extractAuthRefreshAutoDetectRefreshToken(authRefresh = {}, response = {}) {
  return extractAuthRefreshAutoDetectOutput(authRefreshAutoDetectRefreshTokenOutput(authRefresh), response);
}

function authRefreshAutoDetectRefreshTokenOutput(authRefresh = {}) {
  return authRefreshOutputForSlot(authRefresh, 'refreshToken', authRefreshDefaultOutput('refreshToken'));
}

function authRefreshRefreshTokenCookieName(authRefresh = {}) {
  const output = authRefreshAutoDetectRefreshTokenOutput(authRefresh);
  const name = String(output?.path || authRefresh.refreshTokenPath || authRefresh.refreshTokenVariable || '').trim();
  return name && name !== AUTH_REFRESH_RAW_BODY_PATH ? name : 'refresh_token';
}

function extractAuthRefreshAutoDetectOutput(output = {}, response = {}) {
  const source = normalizeAuthRefreshOutputSource(output.source, 'body');
  const path = String(output.path || '').trim();
  if (source === 'rawBody') {
    return String(response?.body || '').trim();
  }
  if (!path) {
    return '';
  }
  if (source === 'header') {
    return extractAuthRefreshAutoDetectHeader(response.headers, path);
  }
  if (source === 'cookie') {
    return extractAuthRefreshAutoDetectCookie(response, path);
  }
  return extractAuthRefreshAutoDetectPath(parseAuthRefreshAutoDetectBody(response.body), path);
}

function parseAuthRefreshAutoDetectBody(body) {
  if (body == null || String(body).trim() === '') {
    return {};
  }
  try {
    return JSON.parse(String(body));
  } catch {
    return {};
  }
}

function extractAuthRefreshAutoDetectHeader(headers = {}, name = '') {
  const target = String(name || '').trim().toLowerCase();
  if (!target || !headers || typeof headers !== 'object') {
    return '';
  }
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === target);
  const value = key ? headers[key] : '';
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function extractAuthRefreshAutoDetectCookie(response = {}, name = '') {
  const target = String(name || '').trim();
  const cookies = [
    ...(Array.isArray(response.updatedCookies) ? response.updatedCookies : []),
    ...(Array.isArray(response.cookies) ? response.cookies : []),
    ...authRefreshAutoDetectSetCookieHeaderCookies(response.headers)
  ];
  return String(cookies.find((cookie) => cookie?.enabled !== false && String(cookie.name || '') === target)?.value || '');
}

function authRefreshAutoDetectSetCookieHeaderCookies(headers = {}) {
  if (!headers || typeof headers !== 'object') {
    return [];
  }
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === 'set-cookie');
  const value = key ? headers[key] : null;
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .map((item) => String(item || '').split(';')[0])
    .map((pair) => {
      const separatorIndex = pair.indexOf('=');
      return separatorIndex > 0
        ? { name: pair.slice(0, separatorIndex).trim(), value: pair.slice(separatorIndex + 1) }
        : null;
    })
    .filter(Boolean);
}

function extractAuthRefreshAutoDetectPath(source, path) {
  const segments = [];
  const pattern = /[^.[\]]+|\[(\d+|(["'])(.*?)\2)\]/g;
  for (const match of String(path || '').matchAll(pattern)) {
    segments.push(match[1] != null ? (match[3] != null ? match[3] : Number(match[1])) : match[0]);
  }
  let value = source;
  for (const segment of segments) {
    if (value == null) {
      return '';
    }
    value = value[segment];
  }
  return value == null ? '' : String(value);
}

function authRefreshOutputDescription(output = {}) {
  const source = normalizeAuthRefreshOutputSource(output.source, 'body');
  if (source === 'rawBody') {
    return 'the entire response body';
  }
  const path = String(output.path || '').trim() || '(empty path)';
  if (source === 'header') {
    return `header "${path}"`;
  }
  if (source === 'cookie') {
    return `cookie "${path}"`;
  }
  return `JSON body path "${path}"`;
}

function authRefreshAutoDetectEnvironment(ownerType, owner) {
  return activeEnvironment();
}

function authRefreshAutoDetectTarget(ownerType, requestKind = 'access', authRefresh = {}) {
  const prefix = ownerType;
  if (requestKind === 'refreshToken') {
    return {
      label: 'refresh token',
      sourceSelectId: `${prefix}AuthRefreshRefreshTokenSourceSelect`,
      pathInputId: `${prefix}AuthRefreshRefreshTokenPathInput`,
      allowedSources: ['body', 'rawBody', 'header', 'cookie']
    };
  }
  const authType = normalizeAuthRefreshUiType($(`${prefix}AuthRefreshTypeSelect`)?.value || authRefresh?.authType);
  if (authType === 'cookie') {
    return {
      label: 'cookie',
      sourceSelectId: '',
      pathInputId: `${prefix}AuthRefreshCookieNameInput`,
      allowedSources: ['cookie']
    };
  }
  const targets = {
    bearer: { label: 'access token', controlName: 'AccessToken' },
    apiKey: { label: 'API key', controlName: 'ApiKey' },
    aws: { label: 'AWS access key ID', controlName: 'AwsAccessKey' },
    custom: { label: 'custom header value', controlName: 'Custom' }
  };
  const target = targets[authType] || targets.bearer;
  return {
    label: target.label,
    sourceSelectId: authType === 'aws'
      ? `${prefix}AuthRefreshAwsCredentialsSourceSelect`
      : `${prefix}AuthRefresh${target.controlName}SourceSelect`,
    pathInputId: `${prefix}AuthRefresh${target.controlName}PathInput`,
    allowedSources: authType === 'aws' ? ['body', 'header', 'cookie'] : ['body', 'rawBody', 'header', 'cookie']
  };
}

function promptAuthRefreshAutoDetect(candidates = [], target = {}) {
  renderAuthRefreshAutoDetectModal(candidates, target);
  return showModal('authRefreshAutoDetectModal', null);
}

function renderAuthRefreshAutoDetectModal(candidates = [], target = {}) {
  authRefreshAutoDetectCandidates = candidates.map((candidate, index) => ({
    ...candidate,
    id: candidate.id || `candidate-${index + 1}`
  }));
  const compatibleCandidates = authRefreshAutoDetectCandidates.filter((candidate) => candidate.compatible === true);
  selectedAuthRefreshAutoDetectCandidateId = '';
  setText('authRefreshAutoDetectTitle', 'Auto-Detect');
  setText('authRefreshAutoDetectMessage', `Select the response item PostMeter should use as the ${target.label || 'auth value'}.`);
  const list = $('authRefreshAutoDetectList');
  const empty = $('authRefreshAutoDetectEmpty');
  const confirm = $('confirmAuthRefreshAutoDetectButton');
  if (confirm) {
    confirm.disabled = true;
  }
  if (!list) {
    return;
  }
  list.textContent = '';
  if (empty) {
    empty.hidden = compatibleCandidates.length > 0;
  }
  for (const section of authRefreshAutoDetectSections(compatibleCandidates)) {
    const sectionElement = document.createElement('section');
    sectionElement.className = 'auth-refresh-auto-detect-section';
    const heading = document.createElement('h3');
    heading.className = 'auth-refresh-auto-detect-section-title';
    heading.textContent = section.label;
    sectionElement.append(heading);
    for (const candidate of section.candidates) {
      sectionElement.append(renderAuthRefreshAutoDetectOption(candidate));
    }
    list.append(sectionElement);
  }
}

function authRefreshAutoDetectSections(candidates = []) {
  const sections = [
    { key: 'body', label: 'Response Body', candidates: [] },
    { key: 'header', label: 'Headers', candidates: [] },
    { key: 'cookie', label: 'Cookies', candidates: [] }
  ];
  const byKey = new Map(sections.map((section) => [section.key, section]));
  for (const candidate of candidates) {
    const key = candidate.source === 'rawBody' ? 'body' : candidate.source;
    const section = byKey.get(key);
    if (section) {
      section.candidates.push(candidate);
    }
  }
  return sections.filter((section) => section.candidates.length > 0);
}

function renderAuthRefreshAutoDetectOption(candidate) {
  const option = document.createElement('label');
  option.className = 'collection-pick-option auth-refresh-auto-detect-option';
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'authRefreshAutoDetectOption';
  input.value = candidate.id;
  input.addEventListener('change', () => selectAuthRefreshAutoDetectCandidate(candidate.id));
  const copy = document.createElement('span');
  copy.className = 'auth-refresh-auto-detect-copy';
  const label = document.createElement('strong');
  label.textContent = candidate.label || authRefreshAutoDetectCandidateSummary(candidate);
  const detail = document.createElement('small');
  detail.textContent = candidate.detail || candidate.valuePreview || '';
  copy.append(label, detail);
  option.append(input, copy);
  return option;
}

function selectAuthRefreshAutoDetectCandidate(candidateId) {
  selectedAuthRefreshAutoDetectCandidateId = String(candidateId || '');
  const confirm = $('confirmAuthRefreshAutoDetectButton');
  if (confirm) {
    confirm.disabled = !authRefreshAutoDetectCandidates.some((candidate) =>
      candidate.id === selectedAuthRefreshAutoDetectCandidateId && candidate.compatible === true
    );
  }
}

function confirmAuthRefreshAutoDetectModal() {
  const selected = authRefreshAutoDetectCandidates.find((candidate) =>
    candidate.id === selectedAuthRefreshAutoDetectCandidateId && candidate.compatible === true
  );
  if (!selected) {
    return;
  }
  resolveActiveModal(selected);
}

function applyAuthRefreshAutoDetectCandidate(ownerType, requestKind, candidate, target = null) {
  const owner = activeAuthRefreshOwnerForType(ownerType);
  if (!owner || !candidate?.source || !candidate?.path) {
    return false;
  }
  const resolvedTarget = target || authRefreshAutoDetectTarget(ownerType, requestKind, owner.authRefresh);
  if (!resolvedTarget || !resolvedTarget.allowedSources.includes(candidate.source)) {
    setStatus('Selected response item is not available for this refreshing auth type.');
    return false;
  }
  const source = candidate.source;
  const path = source === 'rawBody' ? AUTH_REFRESH_RAW_BODY_PATH : candidate.path;
  if (resolvedTarget.sourceSelectId) {
    setValue(resolvedTarget.sourceSelectId, source);
  }
  setValue(resolvedTarget.pathInputId, path);
  owner.authRefresh = collectAuthRefreshFromControls(ownerType, owner.authRefresh || {});
  markAuthRefreshOwnerDirty(ownerType);
  renderAuthRefreshControls(ownerType, owner.authRefresh, true);
  syncDetectedAuthRefreshControls(resolvedTarget, source, path);
  return true;
}

function syncDetectedAuthRefreshControls(target = {}, source = '', path = '') {
  const apply = () => {
    if (target.sourceSelectId) {
      setValue(target.sourceSelectId, source);
      dispatchSyntheticEvent($(target.sourceSelectId), 'change');
    }
    setValue(target.pathInputId, path);
    dispatchSyntheticEvent($(target.pathInputId), 'input');
  };
  apply();
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(apply);
  }
}

function dispatchSyntheticEvent(element, type) {
  if (!element || typeof Event !== 'function') {
    return;
  }
  element.dispatchEvent(new Event(type, { bubbles: true }));
}

function authRefreshAutoDetectCandidateSummary(candidate = {}) {
  if (candidate.source === 'rawBody') {
    return 'the entire response body';
  }
  if (candidate.source === 'header') {
    return `header "${candidate.path}"`;
  }
  if (candidate.source === 'cookie') {
    return `cookie "${candidate.path}"`;
  }
  return `JSON body path "${candidate.path}"`;
}

function autoSelectRefreshingAuthRefreshTokenForAccessRequest(ownerType, owner) {
  if (!owner?.authRefresh?.request) {
    return false;
  }
  if (!refreshingAuthRefreshTokenAvailable(owner.authRefresh)) {
    return false;
  }
  const cookieMode = String(owner.authRefresh.authType || '').trim() === 'cookie';
  if (cookieMode) {
    if (owner.authRefresh.request.useRefreshingAuthCookie !== true) {
      owner.authRefresh.request.refreshingAuthOriginalAuth = normalizeRefreshingAuthOriginalAuth(owner.authRefresh.request.auth);
    }
    owner.authRefresh.request.auth = { type: 'none' };
    owner.authRefresh.request.cookieJar = {
      ...(owner.authRefresh.request.cookieJar || {}),
      enabled: true,
      storeResponses: true
    };
    owner.authRefresh.request.useRefreshingAuthCookie = true;
  } else {
    owner.authRefresh.request.auth = { type: AUTO_REFRESH_REFRESH_TOKEN_AUTH_TYPE };
    delete owner.authRefresh.request.useRefreshingAuthCookie;
  }
  if (activeAuthRefreshRequestOwnerType === ownerType
    && activeAuthRefreshRequestOwnerId === owner.id
    && activeRequestId === owner.authRefresh.request.id) {
    if (cookieMode) {
      syncActiveRequestAutoRefreshAuthTypeOptionWithConfig(owner.authRefresh.request.auth, owner.authRefresh);
      setValue('authTypeSelect', 'none');
      showAuthSection('none');
      syncRunnerRequestRefreshingAuthTypeLock(owner.authRefresh.request.auth);
    } else {
      showRefreshingAuthRefreshTokenOption($('authTypeSelect'), owner.authRefresh);
      setValue('authTypeSelect', AUTO_REFRESH_REFRESH_TOKEN_AUTH_TYPE);
      showAuthSection(AUTO_REFRESH_REFRESH_TOKEN_AUTH_TYPE);
    }
  }
  return true;
}

function activeAuthRefreshOwnerForType(ownerType) {
  if (ownerType === 'runner') {
    return activeRunner();
  }
  if (ownerType === 'performance') {
    return activePerformanceTest();
  }
  return null;
}

function markAuthRefreshOwnerDirty(ownerType) {
  if (ownerType === 'runner') {
    markActiveRunnerDirty();
  } else if (ownerType === 'performance') {
    markActivePerformanceDirty();
  }
}

function openAuthRefreshRequest(ownerType, owner, statusMessage = 'Opened refreshing auth request for editing.', requestKind = 'access') {
  const request = ensureAuthRefreshRequest(owner, requestKind);
  if (!request || !canOpenAuthRefreshRequestTabFor(ownerType, owner.id, request.id)) {
    return null;
  }
  activeCollectionId = null;
  activeFolderId = null;
  activeRequestId = request.id;
  activeRunnerRequestRunnerId = null;
  activeAuthRefreshRequestOwnerType = ownerType;
  activeAuthRefreshRequestOwnerId = owner.id;
  if (ownerType === 'runner') {
    activeRunnerConfigId = owner.id;
    activeSidebarPanel = 'runners';
  } else {
    activePerformanceTestId = owner.id;
    activeSidebarPanel = 'performance';
  }
  activeMainPanel = 'request';
  ensureOpenRequestTabForActive();
  closeCaptureSettingsPanels();
  renderAll();
  setStatus(statusMessage);
  return request;
}

function ensureAuthRefreshRequest(owner, requestKind = 'access') {
  if (!owner) {
    return null;
  }
  owner.authRefresh = normalizeAuthRefreshConfig(owner.authRefresh || {});
  const property = authRefreshRequestProperty(requestKind);
  owner.authRefresh[property] = normalizeAuthRefreshRequest(owner.authRefresh[property] || newAuthRefreshRequest(requestKind), requestKind);
  return owner.authRefresh[property];
}

function newAuthRefreshRequest(requestKind = 'access') {
  return normalizeAuthRefreshRequest({
    ...newRequestObject(authRefreshRequestDefaultName(requestKind)),
    method: 'POST'
  }, requestKind);
}

function cloneRequestForAuthRefresh(request, requestKind = 'access') {
  const clone = cloneJson(request) || newAuthRefreshRequest(requestKind);
  return normalizeAuthRefreshRequest({
    ...clone,
    id: crypto.randomUUID(),
    name: String(clone.name || request?.name || authRefreshRequestDefaultName(requestKind))
  }, requestKind);
}

function normalizeAuthRefreshRequest(request = {}, requestKind = 'access') {
  const normalized = {
    ...newRequestObject(request.name || authRefreshRequestDefaultName(requestKind)),
    ...request
  };
  normalized.id = String(request.id || crypto.randomUUID());
  normalized.name = String(normalized.name || authRefreshRequestDefaultName(requestKind));
  normalized.method = METHODS.includes(String(normalized.method || '').toUpperCase()) ? String(normalized.method).toUpperCase() : 'POST';
  normalized.url = String(normalized.url || '');
  normalized.queryParams = Array.isArray(normalized.queryParams) ? normalized.queryParams : [];
  normalized.headers = Array.isArray(normalized.headers) ? normalized.headers : [];
  normalized.variables = Array.isArray(normalized.variables) ? normalized.variables : [];
  normalized.docs = normalized.docs == null ? '' : String(normalized.docs);
  normalized.scripts = normalized.scripts && typeof normalized.scripts === 'object' ? normalized.scripts : { preRequest: '', tests: '' };
  normalized.auth = normalized.auth && typeof normalized.auth === 'object' ? normalized.auth : { type: 'none' };
  normalized.cookieJar = normalized.cookieJar && typeof normalized.cookieJar === 'object'
    ? normalized.cookieJar
    : { enabled: false, storeResponses: true };
  normalized.autoHeaders = normalized.autoHeaders && typeof normalized.autoHeaders === 'object'
    ? normalized.autoHeaders
    : { sendPostMeterToken: false, showGeneratedHeaders: false };
  normalized.settings = normalizeRendererRequestTlsSettings(normalized.settings || {});
  delete normalized.iterations;
  delete normalized.source;
  return normalized;
}

function authRefreshRequestProperty(requestKind = 'access') {
  return requestKind === 'refreshToken' ? 'refreshTokenRequest' : 'request';
}

function authRefreshRequestDefaultName(requestKind = 'access') {
  return requestKind === 'refreshToken' ? 'Refresh Token' : 'Refresh Auth';
}

function authRefreshRequestLabel(requestKind = 'access') {
  return requestKind === 'refreshToken' ? 'Refresh token request' : 'Auth refresh request';
}

function authRefreshRequestArticle(requestKind = 'access') {
  return requestKind === 'refreshToken' ? 'a' : 'an';
}

function importPerformanceRequestSelection(target) {
  const test = activePerformanceTest();
  const normalized = normalizeRunnerImportTarget(target);
  if (!test || normalized.type !== 'request' || !normalized.collectionId || !normalized.requestId) {
    return null;
  }
  const collection = (workspace.collections || []).find((item) => item.id === normalized.collectionId);
  const entry = collectionRequestEntries(collection).find((candidate) => candidate.request?.id === normalized.requestId
    && (!normalized.folderId || candidate.folder?.id === normalized.folderId));
  if (!entry?.request) {
    setStatus('No request was selected to import.');
    return null;
  }
  const imported = cloneRequestForPerformanceTest(entry.request, runnerRequestSourceFromEntry(entry));
  test.request = imported.request;
  test.source = imported.source;
  markActivePerformanceDirty();
  renderPerformanceEditor();
  setStatus('Request imported into performance test.');
  return test.request;
}
