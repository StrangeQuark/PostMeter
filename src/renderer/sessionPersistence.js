(function attachRendererSessionPersistence(global) {
  const DEFAULT_REQUEST_TAB = 'params';
  const DEFAULT_RESULTS_TAB = 'response';
  const SIDEBAR_PANELS = new Set(['collections', 'environments', 'workspaces', 'runners', 'performance', 'history']);
  const MAIN_PANELS = new Set(['request', 'environment', 'workspace', 'runner', 'performance']);
  const REQUEST_TABS = new Set(['params', 'headers', 'auth', 'cookies', 'body', 'scripts', 'collectionVariables', 'docs']);
  const RESULTS_TABS = new Set(['response', 'responseHeaders', 'responseCookies', 'testResults', 'visualizer']);

  function buildRendererSession(options = {}) {
    const state = options.state || {};
    const doc = options.doc || document;
    const collectionForTab = options.collectionForTab || ((tab) => findCollection(state, tab?.collectionId));
    const requestForTab = options.requestForTab || (() => null);
    const environmentForTab = options.environmentForTab || (() => null);

    return {
      activeWorkspaceId: normalizeId(state.activeWorkspaceId),
      selectedWorkspaceId: normalizeId(state.selectedWorkspaceId),
      activeEnvironmentId: normalizeEnvironmentId(state.activeEnvironmentId),
      activeCollectionId: normalizeId(state.activeCollectionId),
      activeFolderId: normalizeId(state.activeFolderId),
      activeRequestId: normalizeId(state.activeRequestId),
      activeRunnerRequestRunnerId: normalizeId(state.activeRunnerRequestRunnerId),
      activeRunnerConfigId: normalizeId(state.activeRunnerConfigId),
      activePerformanceTestId: normalizeId(state.activePerformanceTestId),
      activeSidebarPanel: normalizeEnum(state.activeSidebarPanel, SIDEBAR_PANELS, 'collections'),
      activeMainPanel: normalizeEnum(state.activeMainPanel, MAIN_PANELS, 'request'),
      activeRequestTab: normalizeEnum(activeTabName(doc, 'request', DEFAULT_REQUEST_TAB), REQUEST_TABS, DEFAULT_REQUEST_TAB),
      activeResultsTab: normalizeEnum(activeTabName(doc, 'results', DEFAULT_RESULTS_TAB), RESULTS_TABS, DEFAULT_RESULTS_TAB),
      openCollectionTabs: (Array.isArray(state.openCollectionTabs) ? state.openCollectionTabs : [])
        .map((tab) => serializeCollectionTab(tab, collectionForTab(tab)))
        .filter(Boolean),
      openRequestTabs: (Array.isArray(state.openRequestTabs) ? state.openRequestTabs : [])
        .map((tab) => serializeRequestTab(tab, requestForTab(tab)))
        .filter(Boolean),
      openEnvironmentTabs: (Array.isArray(state.openEnvironmentTabs) ? state.openEnvironmentTabs : [])
        .map((tab) => serializeEnvironmentTab(tab, environmentForTab(tab)))
        .filter(Boolean),
      openWorkspaceTabs: (Array.isArray(state.openWorkspaceTabs) ? state.openWorkspaceTabs : [])
        .map(serializeWorkspaceTab)
        .filter(Boolean),
      openRunnerTabs: (Array.isArray(state.openRunnerTabs) ? state.openRunnerTabs : [])
        .map((tab) => serializeRunnerTab(tab, runnerForTab(state, tab)))
        .filter(Boolean),
      openPerformanceTabs: (Array.isArray(state.openPerformanceTabs) ? state.openPerformanceTabs : [])
        .map((tab) => serializePerformanceTab(tab, performanceTestForTab(state, tab)))
        .filter(Boolean),
      workspaceOrder: serializeWorkspaceOrder(state),
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

    applyWorkspaceOrder(state, session.workspaceOrder);
    state.draftRequests = new Map();
    for (const draftRequest of session.draftRequests) {
      if (draftRequest?.id) {
        state.draftRequests.set(draftRequest.id, cloneJson(draftRequest));
      }
    }

    restoreCollectionStates(state, session.openCollectionTabs);
    restoreRequestStates(state, session.openRequestTabs, { findFolder, findRequest });
    restoreEnvironmentStates(state, session.openEnvironmentTabs);
    restoreRunnerStates(state, session.openRunnerTabs);
    restorePerformanceStates(state, session.openPerformanceTabs);

    state.openCollectionTabs = session.openCollectionTabs
      .filter((tab) => collectionExists(state, tab.collectionId))
      .map(stripCollectionTabState);
    state.openRequestTabs = session.openRequestTabs
      .filter((tab) => requestTabExists(state, tab, findRequest))
      .map(stripRequestTabState);
    state.openEnvironmentTabs = session.openEnvironmentTabs
      .filter((tab) => environmentExists(state, tab.environmentId))
      .map(stripEnvironmentTabState);
    state.openWorkspaceTabs = session.openWorkspaceTabs
      .filter((tab) => workspaceItems().some((item) => item.id === tab.workspaceId))
      .map(stripWorkspaceTabState);
    state.openRunnerTabs = session.openRunnerTabs
      .filter((tab) => runnerExists(state, tab.runnerId))
      .map(stripRunnerTabState);
    state.openPerformanceTabs = session.openPerformanceTabs
      .filter((tab) => performanceTestExists(state, tab.performanceTestId))
      .map(stripPerformanceTabState);
    restoreSharedRequestStates(state, session);

    // Session restore should override the default request selection created during workspace load.
    state.activeCollectionId = null;
    state.activeFolderId = null;
    state.activeRequestId = null;
    state.activeRunnerRequestRunnerId = null;
    state.activeRunnerConfigId = null;
    state.activePerformanceTestId = null;

    if (workspaceItems().some((item) => item.id === session.activeWorkspaceId)) {
      state.activeWorkspaceId = session.activeWorkspaceId;
    }
    if (workspaceItems().some((item) => item.id === session.selectedWorkspaceId)) {
      state.selectedWorkspaceId = session.selectedWorkspaceId;
    } else if (workspaceItems().some((item) => item.id === state.activeWorkspaceId)) {
      state.selectedWorkspaceId = state.activeWorkspaceId;
    }
    if (
      session.activeMainPanel === 'workspace'
      && !(state.openWorkspaceTabs || []).some((tab) => tab.workspaceId === state.selectedWorkspaceId)
    ) {
      state.selectedWorkspaceId = '';
    }
    let shouldRestoreActiveRunnerConfig = true;
    if (
      session.activeMainPanel === 'runner'
      && !(state.openRunnerTabs || []).some((tab) => tab.runnerId === session.activeRunnerConfigId)
    ) {
      state.activeRunnerConfigId = null;
      shouldRestoreActiveRunnerConfig = false;
    }
    let shouldRestoreActivePerformanceTest = true;
    if (
      session.activeMainPanel === 'performance'
      && !(state.openPerformanceTabs || []).some((tab) => tab.performanceTestId === session.activePerformanceTestId)
    ) {
      state.activePerformanceTestId = null;
      shouldRestoreActivePerformanceTest = false;
    }
    if (session.activeEnvironmentId === 'none' || environmentExists(state, session.activeEnvironmentId)) {
      state.activeEnvironmentId = session.activeEnvironmentId;
    }
    if (shouldRestoreActiveRunnerConfig && runnerExists(state, session.activeRunnerConfigId)) {
      state.activeRunnerConfigId = session.activeRunnerConfigId;
    }
    if (shouldRestoreActivePerformanceTest && performanceTestExists(state, session.activePerformanceTestId)) {
      state.activePerformanceTestId = session.activePerformanceTestId;
    }

    const activeRunnerRequestTab = (state.openRequestTabs || []).find((tab) => (
      tab.runnerRequest === true
      && tab.runnerId === session.activeRunnerRequestRunnerId
      && tab.requestId === session.activeRequestId
    ));
    if (activeRunnerRequestTab && findRunnerRequest(state, session.activeRunnerRequestRunnerId, session.activeRequestId)) {
      state.activeCollectionId = null;
      state.activeFolderId = null;
      state.activeRequestId = session.activeRequestId;
      state.activeRunnerRequestRunnerId = session.activeRunnerRequestRunnerId;
      state.activeRunnerConfigId = session.activeRunnerRequestRunnerId;
    } else {
      const activeDraftTab = (state.openRequestTabs || []).find((tab) => tab.draft === true && tab.requestId === session.activeRequestId);
      if (activeDraftTab && state.draftRequests.has(session.activeRequestId)) {
      state.activeCollectionId = null;
      state.activeFolderId = null;
      state.activeRequestId = session.activeRequestId;
      } else {
      const activeSavedTab = (state.openRequestTabs || []).find((tab) => (
        tab.draft !== true
        && tab.runnerRequest !== true
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
    }

    if (!state.activeRequestId && session.activeMainPanel === 'request' && findCollection(state, session.activeCollectionId)) {
      state.activeCollectionId = session.activeCollectionId;
      state.activeFolderId = null;
      state.activeRunnerRequestRunnerId = null;
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
    const runnerRequest = tab.runnerRequest === true;
    return {
      key: normalizeString(tab.key) || (runnerRequest
        ? `runner-request:${tab.runnerId}:${tab.requestId}`
        : tab.draft ? `draft:${tab.requestId}` : `request:${tab.collectionId}:${tab.requestId}`),
      collectionId: tab.draft || runnerRequest ? '' : normalizeId(tab.collectionId),
      runnerId: runnerRequest ? normalizeId(tab.runnerId) : '',
      requestId: normalizeId(tab.requestId),
      folderId: normalizeId(tab.folderId),
      draft: tab.draft === true,
      runnerRequest,
      dirty: tab.dirty === true,
      createdUnsaved: tab.createdUnsaved === true,
      snapshot: typeof tab.snapshot === 'string' ? tab.snapshot : '',
      currentState: tab.draft || !(tab.dirty === true || tab.createdUnsaved === true) ? null : cloneJson(request)
    };
  }

  function serializeCollectionTab(tab, collection) {
    if (!tab?.collectionId) {
      return null;
    }
    return {
      key: normalizeString(tab.key) || `collection:${tab.collectionId}`,
      collectionId: normalizeId(tab.collectionId),
      dirty: tab.dirty === true,
      createdUnsaved: tab.createdUnsaved === true,
      snapshot: typeof tab.snapshot === 'string' ? tab.snapshot : '',
      currentState: !(tab.dirty === true || tab.createdUnsaved === true) ? null : cloneJson(collection)
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

  function serializeRunnerTab(tab, runner) {
    if (!tab?.runnerId) {
      return null;
    }
    return {
      key: normalizeString(tab.key) || `runner:${tab.runnerId}`,
      runnerId: normalizeId(tab.runnerId),
      dirty: tab.dirty === true,
      createdUnsaved: tab.createdUnsaved === true,
      snapshot: typeof tab.snapshot === 'string' ? tab.snapshot : '',
      currentState: !(tab.dirty === true || tab.createdUnsaved === true) ? null : cloneJson(runner)
    };
  }

  function serializePerformanceTab(tab, test) {
    if (!tab?.performanceTestId) {
      return null;
    }
    return {
      key: normalizeString(tab.key) || `performance:${tab.performanceTestId}`,
      performanceTestId: normalizeId(tab.performanceTestId),
      dirty: tab.dirty === true,
      createdUnsaved: tab.createdUnsaved === true,
      snapshot: typeof tab.snapshot === 'string' ? tab.snapshot : '',
      currentState: !(tab.dirty === true || tab.createdUnsaved === true) ? null : cloneJson(test)
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
      if (tab.runnerRequest === true) {
        const request = findRunnerRequest(state, tab.runnerId, tab.requestId);
        if ((tab.dirty === true || tab.createdUnsaved === true) && request) {
          replaceObject(request, cloneJson(tab.currentState));
        }
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

  function restoreCollectionStates(state, tabs) {
    state.workspace.collections ||= [];
    for (const tab of tabs) {
      if (!tab.currentState) {
        continue;
      }
      const existing = findCollection(state, tab.collectionId);
      if (tab.createdUnsaved === true && !existing) {
        state.workspace.collections.push(cloneJson(tab.currentState));
        continue;
      }
      if ((tab.dirty === true || tab.createdUnsaved === true) && existing) {
        replaceObject(existing, cloneJson(tab.currentState));
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

  function restoreRunnerStates(state, tabs) {
    state.workspace.runners ||= [];
    for (const tab of tabs) {
      if (!tab.currentState) {
        continue;
      }
      const existing = state.workspace.runners.find((runner) => runner.id === tab.runnerId);
      if (tab.createdUnsaved === true && !existing) {
        state.workspace.runners.push(cloneJson(tab.currentState));
        continue;
      }
      if ((tab.dirty === true || tab.createdUnsaved === true) && existing) {
        replaceObject(existing, cloneJson(tab.currentState));
      }
    }
  }

  function restorePerformanceStates(state, tabs) {
    state.workspace.performanceTests ||= [];
    for (const tab of tabs) {
      if (!tab.currentState) {
        continue;
      }
      const existing = state.workspace.performanceTests.find((test) => test.id === tab.performanceTestId);
      if (tab.createdUnsaved === true && !existing) {
        state.workspace.performanceTests.push(cloneJson(tab.currentState));
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
    if (tab.runnerRequest === true) {
      return Boolean(findRunnerRequest(state, tab.runnerId, tab.requestId));
    }
    const collection = findCollection(state, tab.collectionId);
    return Boolean(collection && findRequest(collection, tab.requestId)?.request);
  }

  function collectionExists(state, collectionId) {
    return Boolean(findCollection(state, collectionId));
  }

  function environmentExists(state, environmentId) {
    return state.workspace?.environments?.some((environment) => environment.id === environmentId) === true;
  }

  function runnerExists(state, runnerId) {
    return state.workspace?.runners?.some((runner) => runner.id === runnerId) === true;
  }

  function performanceTestExists(state, testId) {
    return state.workspace?.performanceTests?.some((test) => test.id === testId) === true;
  }

  function runnerForTab(state, tab) {
    return state.workspace?.runners?.find((runner) => runner.id === tab?.runnerId) || null;
  }

  function performanceTestForTab(state, tab) {
    return state.workspace?.performanceTests?.find((test) => test.id === tab?.performanceTestId) || null;
  }

  function findRunnerRequest(state, runnerId, requestId) {
    const runner = runnerForTab(state, { runnerId });
    return (runner?.requests || []).find((request) => request.id === requestId) || null;
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
      return !state.selectedWorkspaceId
        || (state.openWorkspaceTabs || []).some((tab) => tab.workspaceId === state.selectedWorkspaceId);
    }
    if (panel === 'environment') {
      return state.activeEnvironmentId === 'none' || environmentExists(state, state.activeEnvironmentId);
    }
    if (panel === 'runner') {
      return !state.activeRunnerConfigId || runnerExists(state, state.activeRunnerConfigId);
    }
    if (panel === 'performance') {
      return !state.activePerformanceTestId || performanceTestExists(state, state.activePerformanceTestId);
    }
    if (panel !== 'request') {
      return false;
    }
    if (state.activeRunnerRequestRunnerId) {
      return Boolean(findRunnerRequest(state, state.activeRunnerRequestRunnerId, state.activeRequestId));
    }
    if (state.draftRequests.has(state.activeRequestId)) {
      return true;
    }
    if (!state.activeRequestId && findCollection(state, state.activeCollectionId)) {
      return true;
    }
    return Boolean(findSavedRequest(state, state.activeCollectionId, state.activeRequestId, findRequest));
  }

  function shouldRestoreSidebarPanel(panel, state, workspaceItems) {
    if (panel === 'workspaces') {
      return !state.selectedWorkspaceId
        || workspaceItems.some((item) => item.id === state.selectedWorkspaceId);
    }
    if (panel === 'environments') {
      return state.activeEnvironmentId === 'none' || environmentExists(state, state.activeEnvironmentId);
    }
    if (panel === 'runners') {
      return !state.activeRunnerConfigId || runnerExists(state, state.activeRunnerConfigId);
    }
    if (panel === 'performance') {
      return !state.activePerformanceTestId || performanceTestExists(state, state.activePerformanceTestId);
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
      runnerId: tab.runnerId || null,
      requestId: tab.requestId,
      draft: tab.draft === true,
      runnerRequest: tab.runnerRequest === true,
      dirty: tab.dirty === true,
      createdUnsaved: tab.createdUnsaved === true,
      snapshot: typeof tab.snapshot === 'string' ? tab.snapshot : ''
    };
  }

  function stripCollectionTabState(tab) {
    return {
      key: tab.key,
      collectionId: tab.collectionId,
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

  function stripRunnerTabState(tab) {
    return {
      key: tab.key,
      runnerId: tab.runnerId,
      dirty: tab.dirty === true,
      createdUnsaved: tab.createdUnsaved === true,
      snapshot: typeof tab.snapshot === 'string' ? tab.snapshot : ''
    };
  }

  function stripPerformanceTabState(tab) {
    return {
      key: tab.key,
      performanceTestId: tab.performanceTestId,
      dirty: tab.dirty === true,
      createdUnsaved: tab.createdUnsaved === true,
      snapshot: typeof tab.snapshot === 'string' ? tab.snapshot : ''
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
      activeRunnerRequestRunnerId: normalizeId(session.activeRunnerRequestRunnerId),
      activeRunnerConfigId: normalizeId(session.activeRunnerConfigId),
      activePerformanceTestId: normalizeId(session.activePerformanceTestId),
      activeSidebarPanel: normalizeEnum(session.activeSidebarPanel, SIDEBAR_PANELS, 'collections'),
      activeMainPanel: normalizeEnum(session.activeMainPanel, MAIN_PANELS, 'request'),
      activeRequestTab: normalizeEnum(session.activeRequestTab, REQUEST_TABS, DEFAULT_REQUEST_TAB),
      activeResultsTab: normalizeEnum(session.activeResultsTab, RESULTS_TABS, DEFAULT_RESULTS_TAB),
      openCollectionTabs: Array.isArray(session.openCollectionTabs) ? session.openCollectionTabs.filter(isObject) : [],
      openRequestTabs: Array.isArray(session.openRequestTabs) ? session.openRequestTabs.filter(isObject) : [],
      openEnvironmentTabs: Array.isArray(session.openEnvironmentTabs) ? session.openEnvironmentTabs.filter(isObject) : [],
      openWorkspaceTabs: Array.isArray(session.openWorkspaceTabs) ? session.openWorkspaceTabs.filter(isObject) : [],
      openRunnerTabs: Array.isArray(session.openRunnerTabs) ? session.openRunnerTabs.filter(isObject) : [],
      openPerformanceTabs: Array.isArray(session.openPerformanceTabs) ? session.openPerformanceTabs.filter(isObject) : [],
      workspaceOrder: Array.isArray(session.workspaceOrder) ? session.workspaceOrder.map(normalizeId).filter(Boolean) : [],
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

  function serializeWorkspaceOrder(state) {
    return (Array.isArray(state.workspaces) ? state.workspaces : [])
      .map((workspace) => normalizeId(workspace?.id))
      .filter(Boolean);
  }

  function applyWorkspaceOrder(state, order) {
    if (!Array.isArray(state.workspaces) || !Array.isArray(order) || !order.length) {
      return;
    }
    const orderIndex = new Map(order.map((id, index) => [normalizeId(id), index]));
    state.workspaces = [...state.workspaces].sort((left, right) => {
      const leftIndex = orderIndex.has(left?.id) ? orderIndex.get(left.id) : Number.MAX_SAFE_INTEGER;
      const rightIndex = orderIndex.has(right?.id) ? orderIndex.get(right.id) : Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
      return 0;
    });
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
