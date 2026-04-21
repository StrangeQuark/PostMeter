const BODY_TYPES = ['NONE', 'RAW_JSON', 'RAW_TEXT'];
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const TAB_PANEL_IDS = {
  request: ['paramsTab', 'headersTab', 'authTab', 'bodyTab', 'environmentTab'],
  results: ['responseTab', 'loadTab']
};

let workspace;
let workspacePath;
let activeCollectionId;
let activeFolderId = null;
let activeRequestId;
let activeEnvironmentId = 'none';
let activeLoadId = null;
let lastLoadResult = null;
let unsubscribeLoadProgress = null;

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  bindUi();
  unsubscribeLoadProgress = window.postmeter.loadTest.onProgress(({ id, progress }) => {
    if (id === activeLoadId) {
      $('loadResults').textContent = `Running load test...\nCompleted ${progress.completedRequests} of ${progress.requestedRequests} requests.`;
    }
  });
  const loaded = await window.postmeter.workspace.load();
  workspace = loaded.workspace;
  workspacePath = loaded.path;
  selectInitialWorkspaceItem();
  renderAll();
  setStatus(`Workspace loaded: ${workspacePath}`);
});

window.addEventListener('beforeunload', () => {
  if (unsubscribeLoadProgress) {
    unsubscribeLoadProgress();
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
  $('sendButton').addEventListener('click', sendActiveRequest);
  $('addParamButton').addEventListener('click', () => addPair('queryParams'));
  $('addHeaderButton').addEventListener('click', () => addPair('headers'));
  $('newEnvironmentButton').addEventListener('click', newEnvironment);
  $('deleteEnvironmentButton').addEventListener('click', deleteEnvironment);
  $('addVariableButton').addEventListener('click', addVariable);
  $('runLoadButton').addEventListener('click', runLoadTest);
  $('cancelLoadButton').addEventListener('click', cancelLoadTest);
  $('exportLoadJsonButton').addEventListener('click', () => exportLoadResult('json'));
  $('exportLoadCsvButton').addEventListener('click', () => exportLoadResult('csv'));
  $('environmentSelect').addEventListener('change', () => {
    activeEnvironmentId = $('environmentSelect').value;
    renderEnvironmentEditor();
  });
  $('requestNameInput').addEventListener('input', collectRequestFromEditor);
  $('methodSelect').addEventListener('change', collectRequestFromEditor);
  $('urlInput').addEventListener('input', collectRequestFromEditor);
  $('bodyTypeSelect').addEventListener('change', collectRequestFromEditor);
  $('bodyInput').addEventListener('input', collectRequestFromEditor);
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
    'authOauthTokenTypeSelect',
    'authOauthAccessTokenInput',
    'authOauthRefreshTokenInput',
    'authOauthAuthorizationUrlInput',
    'authOauthTokenUrlInput',
    'authOauthClientIdInput',
    'authOauthClientSecretInput',
    'authOauthScopesInput',
    'authClientCertPathInput',
    'authClientKeyPathInput',
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
  renderEnvironmentSelect();
  renderCollections();
  renderHistory();
  renderRequestEditor();
  renderEnvironmentEditor();
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
    $('paramsTable').textContent = '';
    $('headersTable').textContent = '';
    renderAuthEditor({ type: 'none' });
    return;
  }
  $('requestNameInput').value = request.name;
  $('methodSelect').value = request.method;
  $('urlInput').value = request.url;
  $('bodyTypeSelect').value = request.bodyType || 'NONE';
  $('bodyInput').value = request.body || '';
  renderPairs('paramsTable', request.queryParams || [], 'queryParams');
  renderPairs('headersTable', request.headers || [], 'headers');
  renderAuthEditor(request.auth || { type: 'none' });
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
  $('authOauthTokenTypeSelect').value = auth?.tokenType || 'Bearer';
  $('authOauthAccessTokenInput').value = auth?.accessToken || '';
  $('authOauthRefreshTokenInput').value = auth?.refreshToken || '';
  $('authOauthAuthorizationUrlInput').value = auth?.authorizationUrl || '';
  $('authOauthTokenUrlInput').value = auth?.tokenUrl || '';
  $('authOauthClientIdInput').value = auth?.clientId || '';
  $('authOauthClientSecretInput').value = auth?.clientSecret || '';
  $('authOauthScopesInput').value = auth?.scopes || '';
  $('authClientCertPathInput').value = auth?.certPath || '';
  $('authClientKeyPathInput').value = auth?.keyPath || '';
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
    enabled.addEventListener('change', () => { pair.enabled = enabled.checked; });
    const key = document.createElement('input');
    key.placeholder = 'Variable';
    key.value = pair.key || '';
    key.addEventListener('input', () => { pair.key = key.value; });
    const value = document.createElement('input');
    value.placeholder = 'Value';
    value.type = pair.secret ? 'password' : 'text';
    value.value = pair.value || '';
    value.addEventListener('input', () => { pair.value = value.value; });
    const secretLabel = document.createElement('label');
    secretLabel.className = 'secret-toggle';
    const secret = document.createElement('input');
    secret.type = 'checkbox';
    secret.checked = pair.secret === true;
    secret.addEventListener('change', () => {
      pair.secret = secret.checked;
      value.type = pair.secret ? 'password' : 'text';
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
    $('responseBody').value = error.message || String(error);
    setStatus('Request failed.');
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
    .find(([key]) => key.toLowerCase() === 'content-type')?.[1]?.join(',') || '';
  if (!body.trim() || (!body.trim().startsWith('{') && !body.trim().startsWith('[') && !contentType.includes('json'))) {
    return body;
  }
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
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
      allowedHosts,
      confirmedHighConcurrency
    });
    $('loadResults').textContent = formatLoadResult(lastLoadResult);
    $('exportLoadJsonButton').disabled = false;
    $('exportLoadCsvButton').disabled = false;
    setStatus(lastLoadResult.cancelled ? 'Load test cancelled.' : 'Load test completed.');
  } catch (error) {
    $('loadResults').textContent = error.message || String(error);
    setStatus('Load test failed.');
  } finally {
    $('runLoadButton').disabled = false;
    $('cancelLoadButton').disabled = true;
    activeLoadId = null;
  }
}

async function cancelLoadTest() {
  if (activeLoadId) {
    await window.postmeter.loadTest.cancel(activeLoadId);
    setStatus('Cancelling load test...');
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

function formatLoadResult(result) {
  return [
    `Requested requests: ${result.requestedRequests}`,
    `Completed requests: ${result.totalRequests}`,
    `Cancelled: ${result.cancelled}`,
    `Successful: ${result.successfulRequests}`,
    `Failed: ${result.failedRequests}`,
    `Error rate: ${(result.errorRate * 100).toFixed(2)}%`,
    `Requests/sec: ${result.requestsPerSecond.toFixed(2)}`,
    `Latency min/avg/p50/p90/p95/p99/max: ${result.minMillis} / ${result.averageMillis.toFixed(2)} / ${result.p50Millis} / ${result.p90Millis} / ${result.p95Millis} / ${result.p99Millis} / ${result.maxMillis} ms`,
    `Status counts: ${JSON.stringify(result.statusCounts)}`,
    result.errors?.length ? `Errors:\n- ${result.errors.join('\n- ')}` : ''
  ].filter(Boolean).join('\n');
}

async function saveWorkspace(showStatus = true) {
  collectRequestFromEditor();
  collectEnvironmentFromEditor();
  workspace = await window.postmeter.workspace.save(workspace);
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
  const result = await window.postmeter.workspace.exportWorkspace(workspace);
  if (!result.cancelled) {
    setStatus(`Workspace exported to ${result.path}.`);
  }
}

async function importCollection() {
  const result = await window.postmeter.collection.importCollection();
  if (result.cancelled) {
    return;
  }
  result.collection.name = uniqueName(result.collection.name, workspace.collections.map((collection) => collection.name));
  workspace.collections.push(result.collection);
  activeCollectionId = result.collection.id;
  selectFirstRequest(result.collection);
  renderAll();
  await saveWorkspace();
}

async function exportCollection(collection = activeCollection()) {
  if (!collection) {
    return setStatus('Select a collection to export.');
  }
  const result = await window.postmeter.collection.exportCollection(collection);
  if (!result.cancelled) {
    setStatus(`Collection exported to ${result.path}.`);
  }
}

function newCollection() {
  const collection = {
    id: crypto.randomUUID(),
    name: uniqueName('New Collection', workspace.collections.map((existing) => existing.name)),
    description: '',
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
    auth: { type: 'none' }
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

function addPair(fieldName) {
  const request = activeRequest();
  if (request) {
    request[fieldName].push({ enabled: true, key: '', value: '' });
    renderRequestEditor();
  }
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
    return {
      type,
      tokenType: $('authOauthTokenTypeSelect').value,
      accessToken: $('authOauthAccessTokenInput').value,
      refreshToken: $('authOauthRefreshTokenInput').value,
      authorizationUrl: $('authOauthAuthorizationUrlInput').value,
      tokenUrl: $('authOauthTokenUrlInput').value,
      clientId: $('authOauthClientIdInput').value,
      clientSecret: $('authOauthClientSecretInput').value,
      scopes: $('authOauthScopesInput').value,
      grantType: 'authorizationCode',
      expiresAt: existingAuth.type === 'oauth2' ? existingAuth.expiresAt || '' : ''
    };
  }
  if (type === 'clientCertificate') {
    return {
      type,
      certPath: $('authClientCertPathInput').value,
      keyPath: $('authClientKeyPathInput').value,
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
  $('statusLabel').textContent = message;
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
