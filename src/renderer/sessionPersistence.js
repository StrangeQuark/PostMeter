(function attachRendererSessionPersistence(global) {
  const DEFAULT_REQUEST_TAB = 'params';
  const DEFAULT_RESULTS_TAB = 'response';
  const SIDEBAR_PANELS = new Set(['collections', 'environments', 'workspaces', 'history']);
  const MAIN_PANELS = new Set(['request', 'environment', 'workspace']);
  const REQUEST_TABS = new Set(['params', 'headers', 'auth', 'cookies', 'body', 'tests', 'scripts', 'examples', 'collectionVariables']);
  const RESULTS_TABS = new Set(['response', 'load', 'runner']);

  function buildRendererSession(options = {}) {
    const state = options.state || {};
    const doc = options.doc || document;
    const requestForTab = options.requestForTab || (() => null);
    const environmentForTab = options.environmentForTab || (() => null);

    return {
      activeWorkspaceId: normalizeId(state.activeWorkspaceId),
      selectedWorkspaceId: normalizeId(state.selectedWorkspaceId) || normalizeId(state.activeWorkspaceId),
      activeEnvironmentId: normalizeEnvironmentId(state.activeEnvironmentId),
      activeCollectionId: normalizeId(state.activeCollectionId),
      activeFolderId: normalizeId(state.activeFolderId),
      activeRequestId: normalizeId(state.activeRequestId),
      activeSidebarPanel: normalizeEnum(state.activeSidebarPanel, SIDEBAR_PANELS, 'collections'),
      activeMainPanel: normalizeEnum(state.activeMainPanel, MAIN_PANELS, 'request'),
      activeRequestTab: activeTabName(doc, 'request', DEFAULT_REQUEST_TAB),
      activeResultsTab: activeTabName(doc, 'results', DEFAULT_RESULTS_TAB),
      openRequestTabs: (Array.isArray(state.openRequestTabs) ? state.openRequestTabs : [])
        .map((tab) => serializeRequestTab(tab, requestForTab(tab)))
        .filter(Boolean),
      openEnvironmentTabs: (Array.isArray(state.openEnvironmentTabs) ? state.openEnvironmentTabs : [])
        .map((tab) => serializeEnvironmentTab(tab, environmentForTab(tab)))
        .filter(Boolean),
      openWorkspaceTabs: (Array.isArray(state.openWorkspaceTabs) ? state.openWorkspaceTabs : [])
        .map(serializeWorkspaceTab)
        .filter(Boolean),
      draftRequests: Array.from(state.draftRequests instanceof Map ? state.draftRequests.values() : [])
        .map(cloneJson)
        .filter(Boolean),
      dirtyCollectionStates: serializeDirtyCollectionStates(state),
      dirtyCookieJarState: serializeDirtyCookieJarState(state)
    };
  }

  function restoreRendererSession(options = {}) {
    const state = options.state;
    const session = normalizeSession(options.session);
    const workspaceItems = options.workspaceListItems || (() => []);
    const findFolder = options.findFolder || (() => null);
    const findRequest = options.findRequest || (() => null);

    state.draftRequests = new Map();
    for (const draftRequest of session.draftRequests) {
      if (draftRequest?.id) {
        state.draftRequests.set(draftRequest.id, cloneJson(draftRequest));
      }
    }

    restoreRequestStates(state, session.openRequestTabs, { findFolder, findRequest });
    restoreEnvironmentStates(state, session.openEnvironmentTabs);

    state.openRequestTabs = session.openRequestTabs
      .filter((tab) => requestTabExists(state, tab, findRequest))
      .map(stripRequestTabState);
    state.openEnvironmentTabs = session.openEnvironmentTabs
      .filter((tab) => environmentExists(state, tab.environmentId))
      .map(stripEnvironmentTabState);
    state.openWorkspaceTabs = session.openWorkspaceTabs
      .filter((tab) => workspaceItems().some((item) => item.id === tab.workspaceId))
      .map(stripWorkspaceTabState);
    restoreSharedRequestStates(state, session);

    // Session restore should override the default request selection created during workspace load.
    state.activeCollectionId = null;
    state.activeFolderId = null;
    state.activeRequestId = null;

    if (workspaceItems().some((item) => item.id === session.activeWorkspaceId)) {
      state.activeWorkspaceId = session.activeWorkspaceId;
    }
    if (workspaceItems().some((item) => item.id === session.selectedWorkspaceId)) {
      state.selectedWorkspaceId = session.selectedWorkspaceId;
    } else if (workspaceItems().some((item) => item.id === state.activeWorkspaceId)) {
      state.selectedWorkspaceId = state.activeWorkspaceId;
    }
    if (session.activeEnvironmentId === 'none' || environmentExists(state, session.activeEnvironmentId)) {
      state.activeEnvironmentId = session.activeEnvironmentId;
    }

    const activeDraftTab = (state.openRequestTabs || []).find((tab) => tab.draft === true && tab.requestId === session.activeRequestId);
    if (activeDraftTab && state.draftRequests.has(session.activeRequestId)) {
      state.activeCollectionId = null;
      state.activeFolderId = null;
      state.activeRequestId = session.activeRequestId;
    } else {
      const activeSavedTab = (state.openRequestTabs || []).find((tab) => (
        tab.draft !== true
        && tab.collectionId === session.activeCollectionId
        && tab.requestId === session.activeRequestId
      ));
      const restoredRequest = activeSavedTab
        ? findSavedRequest(state, session.activeCollectionId, session.activeRequestId, findRequest)
        : null;
      if (restoredRequest) {
        state.activeCollectionId = session.activeCollectionId;
        state.activeFolderId = restoredRequest.folder?.id || null;
        state.activeRequestId = restoredRequest.request.id;
      }
    }

    if (shouldRestoreMainPanel(session.activeMainPanel, state, workspaceItems(), findRequest)) {
      state.activeMainPanel = session.activeMainPanel;
    }
    if (shouldRestoreSidebarPanel(session.activeSidebarPanel, state, workspaceItems())) {
      state.activeSidebarPanel = session.activeSidebarPanel;
    }

    return {
      activeRequestTab: session.activeRequestTab,
      activeResultsTab: session.activeResultsTab
    };
  }

  function serializeRequestTab(tab, request) {
    if (!tab?.requestId) {
      return null;
    }
    return {
      key: normalizeString(tab.key) || (tab.draft ? `draft:${tab.requestId}` : `request:${tab.collectionId}:${tab.requestId}`),
      collectionId: tab.draft ? '' : normalizeId(tab.collectionId),
      requestId: normalizeId(tab.requestId),
      folderId: normalizeId(tab.folderId),
      draft: tab.draft === true,
      dirty: tab.dirty === true,
      createdUnsaved: tab.createdUnsaved === true,
      snapshot: typeof tab.snapshot === 'string' ? tab.snapshot : '',
      currentState: tab.draft || !(tab.dirty === true || tab.createdUnsaved === true) ? null : cloneJson(request)
    };
  }

  function serializeEnvironmentTab(tab, environment) {
    if (!tab?.environmentId) {
      return null;
    }
    return {
      key: normalizeString(tab.key) || `environment:${tab.environmentId}`,
      environmentId: normalizeId(tab.environmentId),
      dirty: tab.dirty === true,
      createdUnsaved: tab.createdUnsaved === true,
      snapshot: typeof tab.snapshot === 'string' ? tab.snapshot : '',
      currentState: !(tab.dirty === true || tab.createdUnsaved === true) ? null : cloneJson(environment)
    };
  }

  function serializeWorkspaceTab(tab) {
    if (!tab?.workspaceId) {
      return null;
    }
    return {
      key: normalizeString(tab.key) || `workspace:${tab.workspaceId}`,
      workspaceId: normalizeId(tab.workspaceId),
      dirty: tab.dirty === true
    };
  }

  function serializeDirtyCollectionStates(state) {
    if (!(state?.collectionDirtySnapshots instanceof Map) || !(state?.collectionDirtyOwners instanceof Map)) {
      return [];
    }
    const dirtyStates = [];
    for (const [collectionId, snapshot] of state.collectionDirtySnapshots.entries()) {
      const collection = findCollection(state, collectionId);
      if (!collection) {
        continue;
      }
      dirtyStates.push({
        collectionId,
        ownerKey: normalizeString(state.collectionDirtyOwners.get(collectionId)).trim(),
        snapshot: typeof snapshot === 'string' ? snapshot : safeSnapshot(collection.variables || []),
        currentState: cloneJson(collection.variables || [])
      });
    }
    return dirtyStates.filter((entry) => Array.isArray(entry.currentState));
  }

  function serializeDirtyCookieJarState(state) {
    if (state?.cookieJarDirtySnapshot == null) {
      return null;
    }
    return {
      ownerKey: normalizeString(state.cookieJarDirtyOwner).trim(),
      snapshot: typeof state.cookieJarDirtySnapshot === 'string'
        ? state.cookieJarDirtySnapshot
        : safeSnapshot(state.workspace?.cookies || []),
      currentState: cloneJson(state.workspace?.cookies || [])
    };
  }

  function restoreRequestStates(state, tabs, helpers) {
    for (const tab of tabs) {
      if (tab.draft || !tab.currentState) {
        continue;
      }
      const collection = findCollection(state, tab.collectionId);
      if (!collection) {
        continue;
      }
      const found = helpers.findRequest(collection, tab.requestId);
      if (tab.createdUnsaved === true && !found) {
        insertRequestIntoCollection(collection, tab.folderId, cloneJson(tab.currentState), helpers.findFolder);
        continue;
      }
      if ((tab.dirty === true || tab.createdUnsaved === true) && found?.request) {
        replaceObject(found.request, cloneJson(tab.currentState));
      }
    }
  }

  function restoreEnvironmentStates(state, tabs) {
    state.workspace.environments ||= [];
    for (const tab of tabs) {
      if (!tab.currentState) {
        continue;
      }
      const existing = state.workspace.environments.find((environment) => environment.id === tab.environmentId);
      if (tab.createdUnsaved === true && !existing) {
        state.workspace.environments.push(cloneJson(tab.currentState));
        continue;
      }
      if ((tab.dirty === true || tab.createdUnsaved === true) && existing) {
        replaceObject(existing, cloneJson(tab.currentState));
      }
    }
  }

  function restoreSharedRequestStates(state, session) {
    state.workspace ||= {};
    state.workspace.cookies ||= [];
    state.collectionDirtySnapshots = new Map();
    state.collectionDirtyOwners = new Map();
    state.cookieJarDirtySnapshot = null;
    state.cookieJarDirtyOwner = '';
    for (const entry of session.dirtyCollectionStates || []) {
      const ownerKey = normalizeString(entry.ownerKey).trim();
      if (!ownerKey || !(state.openRequestTabs || []).some((tab) => tab.key === ownerKey)) {
        continue;
      }
      const collection = findCollection(state, entry.collectionId);
      if (!collection) {
        continue;
      }
      collection.variables = cloneJson(entry.currentState || []) || [];
      state.collectionDirtySnapshots.set(entry.collectionId, typeof entry.snapshot === 'string' ? entry.snapshot : safeSnapshot(collection.variables));
      state.collectionDirtyOwners.set(entry.collectionId, ownerKey);
    }
    const dirtyCookieJarState = isObject(session.dirtyCookieJarState) ? session.dirtyCookieJarState : null;
    const cookieOwnerKey = normalizeString(dirtyCookieJarState?.ownerKey).trim();
    if (dirtyCookieJarState && cookieOwnerKey && (state.openRequestTabs || []).some((tab) => tab.key === cookieOwnerKey)) {
      state.workspace.cookies = cloneJson(dirtyCookieJarState.currentState || []) || [];
      state.cookieJarDirtySnapshot = typeof dirtyCookieJarState.snapshot === 'string'
        ? dirtyCookieJarState.snapshot
        : safeSnapshot(state.workspace.cookies);
      state.cookieJarDirtyOwner = cookieOwnerKey;
    }
  }

  function requestTabExists(state, tab, findRequest) {
    if (tab.draft === true) {
      return state.draftRequests.has(tab.requestId);
    }
    const collection = findCollection(state, tab.collectionId);
    return Boolean(collection && findRequest(collection, tab.requestId)?.request);
  }

  function environmentExists(state, environmentId) {
    return state.workspace?.environments?.some((environment) => environment.id === environmentId) === true;
  }

  function findSavedRequest(state, collectionId, requestId, findRequest) {
    const collection = findCollection(state, collectionId);
    return collection ? findRequest(collection, requestId) : null;
  }

  function findCollection(state, collectionId) {
    return state.workspace?.collections?.find((collection) => collection.id === collectionId) || null;
  }

  function insertRequestIntoCollection(collection, folderId, request, findFolder) {
    if (!request) {
      return;
    }
    const folder = folderId ? findFolder(collection, folderId) : null;
    if (folder) {
      folder.requests ||= [];
      folder.requests.push(request);
      return;
    }
    collection.requests ||= [];
    collection.requests.push(request);
  }

  function shouldRestoreMainPanel(panel, state, workspaceItems, findRequest) {
    if (panel === 'workspace') {
      return workspaceItems.some((item) => item.id === state.selectedWorkspaceId);
    }
    if (panel === 'environment') {
      return state.activeEnvironmentId === 'none' || environmentExists(state, state.activeEnvironmentId);
    }
    if (panel !== 'request') {
      return false;
    }
    if (state.draftRequests.has(state.activeRequestId)) {
      return true;
    }
    return Boolean(findSavedRequest(state, state.activeCollectionId, state.activeRequestId, findRequest));
  }

  function shouldRestoreSidebarPanel(panel, state, workspaceItems) {
    if (panel === 'workspaces') {
      return workspaceItems.some((item) => item.id === state.selectedWorkspaceId);
    }
    if (panel === 'environments') {
      return state.activeEnvironmentId === 'none' || environmentExists(state, state.activeEnvironmentId);
    }
    return SIDEBAR_PANELS.has(panel);
  }

  function activeTabName(doc, groupName, fallback) {
    const activeButton = doc?.querySelector?.(`.tab.active[data-tab-group="${groupName}"]`);
    return activeButton?.dataset?.tab || fallback;
  }

  function stripRequestTabState(tab) {
    return {
      key: tab.key,
      collectionId: tab.collectionId || null,
      folderId: tab.folderId || null,
      requestId: tab.requestId,
      draft: tab.draft === true,
      dirty: tab.dirty === true,
      createdUnsaved: tab.createdUnsaved === true,
      snapshot: typeof tab.snapshot === 'string' ? tab.snapshot : ''
    };
  }

  function stripEnvironmentTabState(tab) {
    return {
      key: tab.key,
      environmentId: tab.environmentId,
      dirty: tab.dirty === true,
      createdUnsaved: tab.createdUnsaved === true,
      snapshot: typeof tab.snapshot === 'string' ? tab.snapshot : ''
    };
  }

  function stripWorkspaceTabState(tab) {
    return {
      key: tab.key,
      workspaceId: tab.workspaceId,
      dirty: tab.dirty === true
    };
  }

  function normalizeSession(value) {
    const session = isObject(value) ? value : {};
    return {
      activeWorkspaceId: normalizeId(session.activeWorkspaceId),
      selectedWorkspaceId: normalizeId(session.selectedWorkspaceId),
      activeEnvironmentId: normalizeEnvironmentId(session.activeEnvironmentId),
      activeCollectionId: normalizeId(session.activeCollectionId),
      activeFolderId: normalizeId(session.activeFolderId),
      activeRequestId: normalizeId(session.activeRequestId),
      activeSidebarPanel: normalizeEnum(session.activeSidebarPanel, SIDEBAR_PANELS, 'collections'),
      activeMainPanel: normalizeEnum(session.activeMainPanel, MAIN_PANELS, 'request'),
      activeRequestTab: normalizeEnum(session.activeRequestTab, REQUEST_TABS, DEFAULT_REQUEST_TAB),
      activeResultsTab: normalizeEnum(session.activeResultsTab, RESULTS_TABS, DEFAULT_RESULTS_TAB),
      openRequestTabs: Array.isArray(session.openRequestTabs) ? session.openRequestTabs.filter(isObject) : [],
      openEnvironmentTabs: Array.isArray(session.openEnvironmentTabs) ? session.openEnvironmentTabs.filter(isObject) : [],
      openWorkspaceTabs: Array.isArray(session.openWorkspaceTabs) ? session.openWorkspaceTabs.filter(isObject) : [],
      draftRequests: Array.isArray(session.draftRequests) ? session.draftRequests.filter(isObject) : [],
      dirtyCollectionStates: Array.isArray(session.dirtyCollectionStates) ? session.dirtyCollectionStates.filter(isObject) : [],
      dirtyCookieJarState: isObject(session.dirtyCookieJarState) ? session.dirtyCookieJarState : null
    };
  }

  function replaceObject(target, source) {
    if (!target || !source) {
      return;
    }
    for (const key of Object.keys(target)) {
      delete target[key];
    }
    Object.assign(target, source);
  }

  function safeSnapshot(value) {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  function cloneJson(value) {
    if (value == null) {
      return null;
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return null;
    }
  }

  function normalizeEnum(value, allowed, fallback) {
    return allowed.has(value) ? value : fallback;
  }

  function normalizeId(value) {
    return normalizeString(value).trim();
  }

  function normalizeEnvironmentId(value) {
    return normalizeId(value) || 'none';
  }

  function normalizeString(value) {
    return value == null ? '' : String(value);
  }

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  const exported = {
    buildRendererSession,
    restoreRendererSession
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterRendererSessionPersistence = exported;
})(typeof window === 'undefined' ? globalThis : window);
