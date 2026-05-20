const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const BODY_TYPES = new Set([
  'NONE',
  'RAW_JSON',
  'RAW_TEXT',
  'RAW_JAVASCRIPT',
  'RAW_HTML',
  'RAW_XML',
  'FORM_DATA',
  'URLENCODED',
  'BINARY'
]);
const SIDEBAR_PANELS = new Set(['collections', 'environments', 'workspaces', 'runners', 'performance', 'history']);
const MAIN_PANELS = new Set(['request', 'environment', 'workspace', 'runner', 'performance']);
const REQUEST_EDITOR_TABS = new Set(['params', 'headers', 'auth', 'cookies', 'body', 'scripts', 'collectionVariables', 'docs']);
const RESULTS_TABS = new Set(['response', 'responseHeaders', 'responseCookies', 'testResults', 'visualizer']);
const SESSION_VERSION = 1;
const MAX_OPEN_TABS = 128;
const { performanceTestModel } = require('./models');

function defaultSessionState() {
  return {
    version: SESSION_VERSION,
    activeWorkspaceId: '',
    selectedWorkspaceId: '',
    activeEnvironmentId: 'none',
    activeEnvironmentEditorId: 'none',
    activeCollectionId: '',
    activeFolderId: '',
    activeRequestId: '',
    activeRunnerRequestRunnerId: '',
    activeRunnerConfigId: '',
    activePerformanceTestId: '',
    activeSidebarPanel: 'collections',
    activeMainPanel: 'request',
    activeRequestTab: 'params',
    activeResultsTab: 'response',
    openRequestTabs: [],
    openEnvironmentTabs: [],
    openWorkspaceTabs: [],
    openRunnerTabs: [],
    openPerformanceTabs: [],
    workspaceOrder: [],
    draftRequests: [],
    dirtyCollectionStates: [],
    dirtyCookieJarState: null
  };
}

function normalizeSessionState(value = {}) {
  const defaults = defaultSessionState();
  return {
    version: SESSION_VERSION,
    activeWorkspaceId: normalizeId(value.activeWorkspaceId),
    selectedWorkspaceId: normalizeId(value.selectedWorkspaceId),
    activeEnvironmentId: normalizeEnvironmentId(value.activeEnvironmentId),
    activeEnvironmentEditorId: normalizeEnvironmentId(value.activeEnvironmentEditorId ?? value.activeEnvironmentId),
    activeCollectionId: normalizeId(value.activeCollectionId),
    activeFolderId: normalizeId(value.activeFolderId),
    activeRequestId: normalizeId(value.activeRequestId),
    activeRunnerRequestRunnerId: normalizeId(value.activeRunnerRequestRunnerId),
    activeRunnerConfigId: normalizeId(value.activeRunnerConfigId),
    activePerformanceTestId: normalizeId(value.activePerformanceTestId),
    activeSidebarPanel: normalizeEnum(value.activeSidebarPanel, SIDEBAR_PANELS, defaults.activeSidebarPanel),
    activeMainPanel: normalizeEnum(value.activeMainPanel, MAIN_PANELS, defaults.activeMainPanel),
    activeRequestTab: normalizeEnum(value.activeRequestTab, REQUEST_EDITOR_TABS, defaults.activeRequestTab),
    activeResultsTab: normalizeEnum(value.activeResultsTab, RESULTS_TABS, defaults.activeResultsTab),
    openRequestTabs: normalizeArray(value.openRequestTabs, MAX_OPEN_TABS, normalizeRequestTab),
    openEnvironmentTabs: normalizeArray(value.openEnvironmentTabs, MAX_OPEN_TABS, normalizeEnvironmentTab),
    openWorkspaceTabs: normalizeArray(value.openWorkspaceTabs, MAX_OPEN_TABS, normalizeWorkspaceTab),
    openRunnerTabs: normalizeArray(value.openRunnerTabs, MAX_OPEN_TABS, normalizeRunnerTab),
    openPerformanceTabs: normalizeArray(value.openPerformanceTabs, MAX_OPEN_TABS, normalizePerformanceTab),
    workspaceOrder: normalizeArray(value.workspaceOrder, MAX_OPEN_TABS, normalizeId).filter(Boolean),
    draftRequests: normalizeArray(value.draftRequests, MAX_OPEN_TABS, normalizeSessionRequest),
    dirtyCollectionStates: normalizeArray(value.dirtyCollectionStates, MAX_OPEN_TABS, normalizeDirtyCollectionState),
    dirtyCookieJarState: normalizeDirtyCookieJarState(value.dirtyCookieJarState)
  };
}

function normalizeRequestTab(value) {
  if (!isObject(value)) {
    return null;
  }
  const draft = value.draft === true;
  const runnerRequest = value.runnerRequest === true;
  const runnerId = runnerRequest ? normalizeId(value.runnerId) : '';
  const collectionId = draft || runnerRequest ? '' : normalizeId(value.collectionId);
  const requestId = normalizeId(value.requestId);
  const fallbackKey = runnerRequest
    ? `runner-request:${runnerId}:${requestId}`
    : draft ? `draft:${requestId}` : `request:${collectionId}:${requestId}`;
  const key = normalizeTabKey(value.key, fallbackKey);
  if (!requestId || (!draft && !runnerRequest && !collectionId) || (runnerRequest && !runnerId)) {
    return null;
  }
  return {
    key,
    collectionId,
    runnerId,
    requestId,
    folderId: normalizeId(value.folderId),
    draft,
    runnerRequest,
    dirty: value.dirty === true,
    createdUnsaved: value.createdUnsaved === true,
    snapshot: normalizeSnapshot(value.snapshot),
    currentState: draft ? null : normalizeSessionRequest(value.currentState)
  };
}

function normalizeEnvironmentTab(value) {
  if (!isObject(value)) {
    return null;
  }
  const environmentId = normalizeId(value.environmentId);
  if (!environmentId) {
    return null;
  }
  return {
    key: normalizeTabKey(value.key, `environment:${environmentId}`),
    environmentId,
    dirty: value.dirty === true,
    createdUnsaved: value.createdUnsaved === true,
    snapshot: normalizeSnapshot(value.snapshot),
    currentState: normalizeSessionEnvironment(value.currentState)
  };
}

function normalizeWorkspaceTab(value) {
  if (!isObject(value)) {
    return null;
  }
  const workspaceId = normalizeId(value.workspaceId);
  if (!workspaceId) {
    return null;
  }
  return {
    key: normalizeTabKey(value.key, `workspace:${workspaceId}`),
    workspaceId,
    dirty: value.dirty === true
  };
}

function normalizeRunnerTab(value) {
  if (!isObject(value)) {
    return null;
  }
  const runnerId = normalizeId(value.runnerId);
  if (!runnerId) {
    return null;
  }
  return {
    key: normalizeTabKey(value.key, `runner:${runnerId}`),
    runnerId,
    dirty: value.dirty === true,
    createdUnsaved: value.createdUnsaved === true,
    snapshot: normalizeSnapshot(value.snapshot),
    currentState: normalizeSessionRunner(value.currentState)
  };
}

function normalizePerformanceTab(value) {
  if (!isObject(value)) {
    return null;
  }
  const performanceTestId = normalizeId(value.performanceTestId);
  if (!performanceTestId) {
    return null;
  }
  return {
    key: normalizeTabKey(value.key, `performance:${performanceTestId}`),
    performanceTestId,
    dirty: value.dirty === true,
    createdUnsaved: value.createdUnsaved === true,
    snapshot: normalizeSnapshot(value.snapshot),
    currentState: normalizeSessionPerformanceTest(value.currentState)
  };
}

function normalizeDirtyCollectionState(value) {
  if (!isObject(value)) {
    return null;
  }
  const collectionId = normalizeId(value.collectionId);
  if (!collectionId) {
    return null;
  }
  return {
    collectionId,
    ownerKey: normalizeString(value.ownerKey).trim(),
    snapshot: normalizeSnapshot(value.snapshot),
    currentState: normalizePairs(value.currentState)
  };
}

function normalizeDirtyCookieJarState(value) {
  if (!isObject(value)) {
    return null;
  }
  return {
    ownerKey: normalizeString(value.ownerKey).trim(),
    snapshot: normalizeSnapshot(value.snapshot),
    currentState: normalizeObjectArray(value.currentState)
  };
}

function normalizeSessionRequest(value) {
  if (!isObject(value)) {
    return null;
  }
  const id = normalizeId(value.id);
  if (!id) {
    return null;
  }
  const request = {
    id,
    name: normalizeNonEmptyString(value.name, 'Untitled Request'),
    method: normalizeEnum(String(value.method || '').toUpperCase(), HTTP_METHODS, 'GET'),
    url: normalizeString(value.url),
    queryParams: normalizePairs(value.queryParams),
    headers: normalizePairs(value.headers),
    bodyType: normalizeEnum(value.bodyType, BODY_TYPES, 'NONE'),
    body: normalizeString(value.body),
    auth: clonePlainObject(value.auth, { type: 'none' }),
    scripts: {
      preRequest: normalizeString(value?.scripts?.preRequest),
      tests: normalizeString(value?.scripts?.tests)
    },
    variables: normalizePairs(value.variables),
    docs: normalizeString(value.docs),
    cookieJar: {
      enabled: value?.cookieJar?.enabled === true,
      storeResponses: value?.cookieJar?.storeResponses !== false
    }
  };
  const postmanBody = clonePlainObject(value.postmanBody, {});
  if (Object.keys(postmanBody).length) {
    request.postmanBody = postmanBody;
  }
  const postman = clonePlainObject(value.postman, {});
  if (Object.keys(postman).length) {
    request.postman = postman;
  }
  return request;
}

function normalizeSessionEnvironment(value) {
  if (!isObject(value)) {
    return null;
  }
  const id = normalizeId(value.id);
  if (!id) {
    return null;
  }
  return {
    id,
    name: normalizeNonEmptyString(value.name, 'Untitled Environment'),
    variables: normalizePairs(value.variables)
  };
}

function normalizeSessionRunner(value) {
  if (!isObject(value)) {
    return null;
  }
  const id = normalizeId(value.id);
  if (!id) {
    return null;
  }
  return {
    id,
    name: normalizeNonEmptyString(value.name, 'Untitled Runner'),
    environmentId: normalizeEnvironmentId(value.environmentId),
    stopOnFailure: value.stopOnFailure !== false,
    allowEnvironmentMutation: value.allowEnvironmentMutation === true,
    requests: normalizeArray(value.requests, 1000, normalizeSessionRequest)
  };
}

function normalizeSessionPerformanceTest(value) {
  if (!isObject(value)) {
    return null;
  }
  const id = normalizeId(value.id);
  if (!id) {
    return null;
  }
  return performanceTestModel({
    ...clonePlainObject(value, {}),
    id
  });
}

function normalizePairs(value) {
  return normalizeArray(value, 1000, (pair) => {
    if (!isObject(pair)) {
      return null;
    }
    return {
      enabled: pair.enabled !== false,
      key: normalizeString(pair.key),
      value: normalizeString(pair.value)
    };
  });
}

function normalizeObjectArray(value) {
  return normalizeArray(value, 1000, (item) => clonePlainObject(item, null));
}

function normalizeArray(value, maxItems, mapper) {
  if (!Array.isArray(value)) {
    return [];
  }
  const output = [];
  for (const entry of value.slice(0, maxItems)) {
    const normalized = mapper(entry);
    if (normalized != null) {
      output.push(normalized);
    }
  }
  return output;
}

function normalizeEnum(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function normalizeId(value) {
  return normalizeString(value).trim();
}

function normalizeEnvironmentId(value) {
  const normalized = normalizeId(value);
  return normalized || 'none';
}

function normalizeTabKey(value, fallback) {
  const normalized = normalizeString(value).trim();
  return normalized || fallback;
}

function normalizeSnapshot(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeString(value) {
  return value == null ? '' : String(value);
}

function normalizeNonEmptyString(value, fallback) {
  const normalized = normalizeString(value).trim();
  return normalized || fallback;
}

function clonePlainObject(value, fallback) {
  if (!isObject(value)) {
    return fallback;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

module.exports = {
  MAX_OPEN_TABS,
  SESSION_VERSION,
  defaultSessionState,
  normalizeSessionState
};
