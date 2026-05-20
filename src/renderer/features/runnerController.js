function addNewRunnerLocalRequest() {
  const runner = activeRunner();
  if (!runner) {
    return null;
  }
  runner.requests = normalizeRunnerRequests(runner.requests);
  runner.requests.push({
    ...newRequestObject(uniqueName('New Request', runner.requests.map((request) => request.name))),
    iterations: 1
  });
  markActiveRunnerDirty();
  renderRunnerEditor();
  setStatus('Runner request added.');
  return runner.requests.at(-1);
}

function editRunnerRequest(runner, request) {
  if (!runner || !request) {
    return null;
  }
  collectActiveEditorState();
  runner.requests = Array.isArray(runner.requests) ? runner.requests : [];
  const target = runner.requests.find((item) => item.id === request.id);
  if (!target || !canOpenRunnerRequestTabFor(runner.id, target.id)) {
    return null;
  }
  activeCollectionId = null;
  activeFolderId = null;
  activeRequestId = target.id;
  activeRunnerRequestRunnerId = runner.id;
  activeRunnerConfigId = runner.id;
  activeSidebarPanel = 'runners';
  activeMainPanel = 'request';
  ensureOpenRequestTabForActive();
  renderAll();
  setStatus('Opened runner request for editing.');
  return target;
}

function addCollectionRequestToRunner(entry) {
  const runner = activeRunner();
  const request = entry?.request || entry;
  if (!runner || !request) {
    return null;
  }
  runner.requests = normalizeRunnerRequests(runner.requests);
  runner.requests.push(cloneRequestForRunner(request, runnerRequestSourceFromEntry(entry)));
  markActiveRunnerDirty();
  renderRunnerEditor();
  setStatus('Request added to runner.');
  return runner.requests.at(-1);
}

function importCollectionIntoRunner(collection) {
  const runner = activeRunner();
  if (!runner || !collection) {
    return 0;
  }
  const requests = collectionRequestEntries(collection).map((entry) => cloneRequestForRunner(entry.request, runnerRequestSourceFromEntry(entry)));
  runner.requests = [...normalizeRunnerRequests(runner.requests), ...requests];
  markActiveRunnerDirty();
  renderRunnerEditor();
  setStatus(`${requests.length} request${requests.length === 1 ? '' : 's'} imported into runner.`);
  return requests.length;
}

function generateRunnerFromCollection(collection) {
  if (!collection) {
    return null;
  }
  return generateRunnerFromRequestEntries(collection.name || 'Untitled Collection', collectionRequestEntries(collection));
}

function generateRunnerFromFolder(collection, folder) {
  if (!collection || !folder) {
    return null;
  }
  return generateRunnerFromRequestEntries(folder.name || 'Untitled Folder', runnerImportFolderRequestEntries(collection, folder));
}

function generateRunnerFromRequestEntries(sourceName, entries = []) {
  if (!canOpenAdditionalRunnerTab()) {
    return null;
  }
  ensureWorkspaceRunners();
  collectActiveEditorState();
  activeRunnerRequestRunnerId = null;
  const baseName = `${String(sourceName || '').trim() || 'Generated'} Runner`;
  const runner = newRunnerObject(uniqueName(baseName, workspace.runners.map((existing) => existing.name)));
  runner.requests = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry?.request)
    .map((entry) => cloneRequestForRunner(entry.request, runnerRequestSourceFromEntry(entry)));
  workspace.runners.push(runner);
  activeRunnerConfigId = runner.id;
  activeSidebarPanel = 'runners';
  activeMainPanel = 'runner';
  ensureOpenRunnerTabForActive({ dirty: true, createdUnsaved: true });
  renderAll();
  setStatus(`Generated runner: ${runnerDisplayName(runner)}.`);
  return runner;
}

function collectionRequestEntries(collection) {
  const entries = [];
  for (const request of collection?.requests || []) {
    entries.push({ collection, request, folder: null, folderPath: [] });
  }
  const walkFolder = (folder, folderPath) => {
    const nextFolderPath = [...folderPath, folder.name || 'Untitled Folder'];
    for (const request of folder.requests || []) {
      entries.push({ collection, request, folder, folderPath: nextFolderPath });
    }
    for (const child of folder.folders || []) {
      walkFolder(child, nextFolderPath);
    }
  };
  for (const folder of collection?.folders || []) {
    walkFolder(folder, []);
  }
  return entries;
}

function runnerRequestSourceFromEntry(entry = {}) {
  const collection = entry.collection || null;
  const request = entry.request || entry;
  const folder = entry.folder || null;
  const source = {
    collectionId: collection?.id || '',
    collectionName: collection?.name || '',
    folderId: folder?.id || '',
    folderName: folder?.name || '',
    requestId: request?.id || '',
    requestName: request?.name || ''
  };
  if (Array.isArray(entry.folderPath) && entry.folderPath.length) {
    source.folderPath = entry.folderPath;
  }
  return source;
}

function normalizeRunnerRequestSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return {};
  }
  const normalized = {};
  for (const key of ['collectionId', 'collectionName', 'folderId', 'folderName', 'requestId', 'requestName']) {
    const value = String(source[key] || '').trim();
    if (value) {
      normalized[key] = value.slice(0, 512);
    }
  }
  if (Array.isArray(source.folderPath)) {
    const folderPath = source.folderPath
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 20);
    if (folderPath.length) {
      normalized.folderPath = folderPath;
    }
  }
  return normalized;
}

function cloneRequestForRunner(request, source = {}) {
  const clone = cloneJson(request) || newRequestObject(request?.name || 'Untitled Request');
  clone.id = crypto.randomUUID();
  clone.name = String(clone.name || request?.name || 'Untitled Request');
  const normalizedSource = normalizeRunnerRequestSource(source);
  if (Object.keys(normalizedSource).length) {
    clone.source = normalizedSource;
  } else {
    delete clone.source;
  }
  return normalizeRunnerRequest(clone);
}

function moveRunnerRequest(runner, fromIndex, toIndex) {
  runner.requests = normalizeRunnerRequests(runner.requests);
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= runner.requests.length || toIndex >= runner.requests.length) {
    return;
  }
  const [request] = runner.requests.splice(fromIndex, 1);
  runner.requests.splice(toIndex, 0, request);
  markActiveRunnerDirty();
  renderRunnerEditor();
}

function deleteRunnerRequest(runner, index) {
  runner.requests = normalizeRunnerRequests(runner.requests);
  if (index < 0 || index >= runner.requests.length) {
    return;
  }
  runner.requests.splice(index, 1);
  markActiveRunnerDirty();
  renderRunnerEditor();
}

function ensureWorkspaceRunners() {
  workspace ||= {};
  workspace.runners = normalizeWorkspaceRunners(workspace.runners);
  return workspace.runners;
}

function normalizeWorkspaceRunners(value) {
  return Array.isArray(value)
    ? value.filter((runner) => runner && typeof runner === 'object').map(normalizeRunner)
    : [];
}

function normalizeRunner(runner) {
  runner.id = String(runner.id || crypto.randomUUID());
  runner.name = String(runner.name || 'Untitled Runner');
  runner.environmentId = String(runner.environmentId || 'none') || 'none';
  runner.stopOnFailure = runner.stopOnFailure !== false;
  runner.allowEnvironmentMutation = runner.allowEnvironmentMutation === true;
  runner.capturePolicy = normalizeResultCapturePolicy(runner.capturePolicy || {}, 'runner');
  runner.authRefresh = normalizeAuthRefreshConfig(runner.authRefresh || {});
  runner.csvVariables = normalizeCsvVariableDataDefaultOff(runner.csvVariables);
  runner.requests = normalizeRunnerRequests(runner.requests);
  if (runner.environmentId !== 'none' && !(workspace.environments || []).some((environment) => environment.id === runner.environmentId)) {
    runner.environmentId = 'none';
  }
  return runner;
}

function normalizeRunnerRequests(value) {
  return Array.isArray(value)
    ? value.filter((request) => request && typeof request === 'object').map(normalizeRunnerRequest)
    : [];
}

function normalizeRunnerRequest(request) {
  const normalized = {
    ...newRequestObject(request.name || 'Untitled Request'),
    ...request
  };
  normalized.id = String(request.id || crypto.randomUUID());
  normalized.method = METHODS.includes(String(normalized.method || '').toUpperCase()) ? String(normalized.method).toUpperCase() : 'GET';
  normalized.name = String(normalized.name || 'Untitled Request');
  normalized.url = String(normalized.url || '');
  normalized.queryParams = Array.isArray(normalized.queryParams) ? normalized.queryParams : [];
  normalized.headers = Array.isArray(normalized.headers) ? normalized.headers : [];
  normalized.variables = Array.isArray(normalized.variables) ? normalized.variables : [];
  normalized.docs = normalized.docs == null ? '' : String(normalized.docs);
  normalized.scripts = normalized.scripts && typeof normalized.scripts === 'object' ? normalized.scripts : { preRequest: '', tests: '' };
  normalized.auth = normalized.auth && typeof normalized.auth === 'object' ? normalized.auth : { type: 'none' };
  if ((normalized.auth?.type === AUTO_REFRESH_AUTH_TYPE || request.useRefreshingAuthCookie === true)
    && request.refreshingAuthOriginalAuth && typeof request.refreshingAuthOriginalAuth === 'object') {
    normalized.refreshingAuthOriginalAuth = normalizeRefreshingAuthOriginalAuth(request.refreshingAuthOriginalAuth);
  } else {
    delete normalized.refreshingAuthOriginalAuth;
  }
  if (request.useRefreshingAuthCookie === true) {
    normalized.useRefreshingAuthCookie = true;
  } else {
    delete normalized.useRefreshingAuthCookie;
  }
  normalized.iterations = normalizeRunnerRequestIterations(normalized.iterations);
  return normalized;
}

function normalizeRunnerRequestIterations(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.min(MAX_RUNNER_REQUEST_ITERATIONS, Math.max(1, Math.floor(numeric)));
}

function normalizeImportedEnvironment(environment = {}) {
  return {
    id: String(environment.id || crypto.randomUUID()),
    name: String(environment.name || 'Untitled Environment'),
    variables: Array.isArray(environment.variables)
      ? environment.variables
        .filter((variable) => variable && typeof variable === 'object')
        .map((variable) => ({
          enabled: variable.enabled !== false,
          key: String(variable.key || ''),
          value: String(variable.value ?? '')
        }))
      : []
  };
}

function cloneJson(value) {
  if (value == null) {
    return null;
  }
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}
