(function attachRendererState(global) {
  const MAX_OPEN_TABS = 128;

  function createRendererState() {
    return {
      workspace: null,
      workspacePath: '',
      workspaces: [],
      selectedWorkspaceId: '',
      activeCollectionId: null,
      activeFolderId: null,
      activeRequestId: null,
      activeAuthRefreshRequestOwnerType: '',
      activeAuthRefreshRequestOwnerId: null,
      activeRunnerRequestRunnerId: null,
      activeRunnerConfigId: null,
      activePerformanceTestId: null,
      activeEnvironmentId: 'none',
      activeEnvironmentEditorId: 'none',
      activeWorkspaceId: 'current',
      activeSidebarPanel: 'collections',
      activeMainPanel: 'request',
      draftRequests: new Map(),
      openCollectionTabs: [],
      openFolderTabs: [],
      openRequestTabs: [],
      openEnvironmentTabs: [],
      openWorkspaceTabs: [],
      openRunnerTabs: [],
      openPerformanceTabs: [],
      collapsedCollectionIds: new Set(),
      collapsedFolderIds: new Set(),
      collectionDirtySnapshots: new Map(),
      collectionDirtyOwners: new Map(),
      cookieJarDirtySnapshot: null,
      cookieJarDirtyOwner: '',
      activeOauthFlowId: null,
      activeRunnerId: null,
      lastRunnerResult: null,
      lastResponse: null,
      lastStatusMessage: 'Ready',
      lastUserNotification: null,
      activeModalId: null,
      activeModalCancelValue: null,
      activeModalResolver: null,
      selectedDraftSaveCollectionId: '',
      selectedExportCollectionId: '',
      selectedExportItemId: '',
      maxOpenRequestTabs: MAX_OPEN_TABS
    };
  }

  function activeRequestTabKey(state) {
    if (!state?.activeRequestId) {
      return '';
    }
    if (!state.activeCollectionId && !state.activeRunnerRequestRunnerId && state.activeAuthRefreshRequestOwnerType && state.activeAuthRefreshRequestOwnerId) {
      return `auth-request:${state.activeAuthRefreshRequestOwnerType}:${state.activeAuthRefreshRequestOwnerId}:${state.activeRequestId}`;
    }
    if (state.activeRunnerRequestRunnerId) {
      return `runner-request:${state.activeRunnerRequestRunnerId}:${state.activeRequestId}`;
    }
    return state.activeCollectionId
      ? `request:${state.activeCollectionId}:${state.activeRequestId}`
      : `draft:${state.activeRequestId}`;
  }

  function activeCollectionTabKey(state) {
    return state?.activeCollectionId && !state.activeFolderId && !state.activeRequestId && state.activeMainPanel === 'request'
      ? `collection:${state.activeCollectionId}`
      : '';
  }

  function activeFolderTabKey(state) {
    return state?.activeCollectionId && state.activeFolderId && !state.activeRequestId && state.activeMainPanel === 'request'
      ? `folder:${state.activeCollectionId}:${state.activeFolderId}`
      : '';
  }

  function activeEnvironmentTabKey(state) {
    const environmentId = state?.activeEnvironmentEditorId ?? state?.activeEnvironmentId;
    return environmentId && environmentId !== 'none'
      ? `environment:${environmentId}`
      : '';
  }

  function activeWorkspaceTabKey(state) {
    return state?.selectedWorkspaceId ? `workspace:${state.selectedWorkspaceId}` : '';
  }

  function activeRunnerTabKey(state) {
    return state?.activeRunnerConfigId ? `runner:${state.activeRunnerConfigId}` : '';
  }

  function activePerformanceTabKey(state) {
    return state?.activePerformanceTestId ? `performance:${state.activePerformanceTestId}` : '';
  }

  function isActiveRequestTab(state, tab) {
    return state?.activeMainPanel === 'request' && tab?.key === activeRequestTabKey(state);
  }

  function isActiveCollectionTab(state, tab) {
    return state?.activeMainPanel === 'request' && tab?.key === activeCollectionTabKey(state);
  }

  function isActiveFolderTab(state, tab) {
    return state?.activeMainPanel === 'request' && tab?.key === activeFolderTabKey(state);
  }

  function isActiveEnvironmentTab(state, tab) {
    return state?.activeMainPanel === 'environment' && tab?.key === activeEnvironmentTabKey(state);
  }

  function isActiveWorkspaceTab(state, tab) {
    return state?.activeMainPanel === 'workspace' && tab?.key === activeWorkspaceTabKey(state);
  }

  function isActiveRunnerTab(state, tab) {
    return state?.activeMainPanel === 'runner' && tab?.key === activeRunnerTabKey(state);
  }

  function isActivePerformanceTab(state, tab) {
    return state?.activeMainPanel === 'performance' && tab?.key === activePerformanceTabKey(state);
  }

  function requestSnapshot(request) {
    try {
      return JSON.stringify(request);
    } catch {
      return '{}';
    }
  }

  function collectionSnapshot(collection) {
    try {
      return JSON.stringify(collection);
    } catch {
      return '{}';
    }
  }

  function folderSnapshot(folder) {
    try {
      return JSON.stringify(folder);
    } catch {
      return '{}';
    }
  }

  function environmentSnapshot(environment) {
    try {
      return JSON.stringify(environment);
    } catch {
      return '{}';
    }
  }

  function runnerSnapshot(runner) {
    try {
      return JSON.stringify(runner);
    } catch {
      return '{}';
    }
  }

  function performanceTestSnapshot(test) {
    try {
      return JSON.stringify(test);
    } catch {
      return '{}';
    }
  }

  function clearSavedRequestDirtyState(state, options = {}) {
    const requestForTab = options.requestForTab || (() => null);
    for (const tab of state?.openRequestTabs || []) {
      if (tab.draft) {
        continue;
      }
      const request = requestForTab(tab);
      tab.dirty = false;
      tab.createdUnsaved = false;
      if (request) {
        tab.snapshot = requestSnapshot(request);
      }
    }
    options.onAfterClear?.();
  }

  function clearSavedCollectionTabDirtyState(state, options = {}) {
    const collectionForTab = options.collectionForTab || (() => null);
    for (const tab of state?.openCollectionTabs || []) {
      const collection = collectionForTab(tab);
      tab.dirty = false;
      tab.createdUnsaved = false;
      if (collection) {
        tab.snapshot = collectionSnapshot(collection);
      }
    }
    options.onAfterClear?.();
  }

  function clearSavedFolderTabDirtyState(state, options = {}) {
    const folderForTab = options.folderForTab || (() => null);
    for (const tab of state?.openFolderTabs || []) {
      const folder = folderForTab(tab);
      tab.dirty = false;
      tab.createdUnsaved = false;
      if (folder) {
        tab.snapshot = folderSnapshot(folder);
      }
    }
    options.onAfterClear?.();
  }

  function clearSavedEnvironmentDirtyState(state, options = {}) {
    const environmentForTab = options.environmentForTab || (() => null);
    for (const tab of state?.openEnvironmentTabs || []) {
      const environment = environmentForTab(tab);
      tab.dirty = false;
      tab.createdUnsaved = false;
      if (environment) {
        tab.snapshot = environmentSnapshot(environment);
      }
    }
    options.onAfterClear?.();
  }

  function clearSavedRunnerDirtyState(state, options = {}) {
    const runnerForTab = options.runnerForTab || (() => null);
    for (const tab of state?.openRunnerTabs || []) {
      const runner = runnerForTab(tab);
      tab.dirty = false;
      tab.createdUnsaved = false;
      if (runner) {
        tab.snapshot = runnerSnapshot(runner);
      }
    }
    options.onAfterClear?.();
  }

  function clearSavedPerformanceDirtyState(state, options = {}) {
    const performanceTestForTab = options.performanceTestForTab || (() => null);
    for (const tab of state?.openPerformanceTabs || []) {
      const test = performanceTestForTab(tab);
      tab.dirty = false;
      tab.createdUnsaved = false;
      if (test) {
        tab.snapshot = performanceTestSnapshot(test);
      }
    }
    options.onAfterClear?.();
  }

  function clearSharedRequestDirtyState(state) {
    if (!state) {
      return;
    }
    state.collectionDirtySnapshots = new Map();
    state.collectionDirtyOwners = new Map();
    state.cookieJarDirtySnapshot = null;
    state.cookieJarDirtyOwner = '';
  }

  function resetTabState(state, options = {}) {
    if (!state) {
      return;
    }
    state.openRequestTabs = [];
    state.openCollectionTabs = [];
    state.openFolderTabs = [];
    state.openEnvironmentTabs = [];
    state.openWorkspaceTabs = [];
    state.openRunnerTabs = [];
    state.openPerformanceTabs = [];
    state.activeAuthRefreshRequestOwnerType = '';
    state.activeAuthRefreshRequestOwnerId = null;
    if (options.clearDrafts !== false) {
      state.draftRequests = new Map();
    }
    clearSharedRequestDirtyState(state);
  }

  function openModalState(state, modalId, resolver, cancelValue = null) {
    if (!state) {
      return;
    }
    state.activeModalId = modalId;
    state.activeModalCancelValue = cancelValue;
    state.activeModalResolver = resolver;
  }

  function resolveModalState(state) {
    if (!state) {
      return null;
    }
    const resolver = state.activeModalResolver;
    state.activeModalResolver = null;
    state.activeModalId = null;
    state.activeModalCancelValue = null;
    return resolver;
  }

  const exported = {
    MAX_OPEN_TABS,
    activeCollectionTabKey,
    activeEnvironmentTabKey,
    activeFolderTabKey,
    activePerformanceTabKey,
    activeRequestTabKey,
    activeRunnerTabKey,
    activeWorkspaceTabKey,
    clearSavedCollectionTabDirtyState,
    clearSavedEnvironmentDirtyState,
    clearSavedFolderTabDirtyState,
    clearSavedPerformanceDirtyState,
    clearSavedRunnerDirtyState,
    clearSharedRequestDirtyState,
    clearSavedRequestDirtyState,
    createRendererState,
    collectionSnapshot,
    environmentSnapshot,
    folderSnapshot,
    isActiveCollectionTab,
    isActiveEnvironmentTab,
    isActiveFolderTab,
    isActivePerformanceTab,
    isActiveRequestTab,
    isActiveRunnerTab,
    isActiveWorkspaceTab,
    openModalState,
    performanceTestSnapshot,
    requestSnapshot,
    runnerSnapshot,
    resetTabState,
    resolveModalState
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterRendererState = exported;
})(typeof window === 'undefined' ? globalThis : window);
