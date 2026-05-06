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
      activeRunnerRequestRunnerId: null,
      activeRunnerConfigId: null,
      activeEnvironmentId: 'none',
      activeWorkspaceId: 'current',
      activeSidebarPanel: 'collections',
      activeMainPanel: 'request',
      draftRequests: new Map(),
      openRequestTabs: [],
      openEnvironmentTabs: [],
      openWorkspaceTabs: [],
      openRunnerTabs: [],
      collectionDirtySnapshots: new Map(),
      collectionDirtyOwners: new Map(),
      cookieJarDirtySnapshot: null,
      cookieJarDirtyOwner: '',
      activeLoadId: null,
      activeOauthFlowId: null,
      activeRunnerId: null,
      lastLoadResult: null,
      lastRunnerResult: null,
      lastResponse: null,
      lastStatusMessage: 'Ready',
      lastUserNotification: null,
      activeModalId: null,
      activeModalCancelValue: null,
      activeModalResolver: null,
      selectedDraftSaveCollectionId: '',
      selectedExportCollectionId: '',
      maxOpenRequestTabs: MAX_OPEN_TABS
    };
  }

  function activeRequestTabKey(state) {
    if (!state?.activeRequestId) {
      return '';
    }
    if (state.activeRunnerRequestRunnerId) {
      return `runner-request:${state.activeRunnerRequestRunnerId}:${state.activeRequestId}`;
    }
    return state.activeCollectionId
      ? `request:${state.activeCollectionId}:${state.activeRequestId}`
      : `draft:${state.activeRequestId}`;
  }

  function activeEnvironmentTabKey(state) {
    return state?.activeEnvironmentId && state.activeEnvironmentId !== 'none'
      ? `environment:${state.activeEnvironmentId}`
      : '';
  }

  function activeWorkspaceTabKey(state) {
    return state?.selectedWorkspaceId ? `workspace:${state.selectedWorkspaceId}` : '';
  }

  function activeRunnerTabKey(state) {
    return state?.activeRunnerConfigId ? `runner:${state.activeRunnerConfigId}` : '';
  }

  function isActiveRequestTab(state, tab) {
    return state?.activeMainPanel === 'request' && tab?.key === activeRequestTabKey(state);
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

  function requestSnapshot(request) {
    try {
      return JSON.stringify(request);
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
    state.openEnvironmentTabs = [];
    state.openWorkspaceTabs = [];
    state.openRunnerTabs = [];
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
    activeEnvironmentTabKey,
    activeRequestTabKey,
    activeRunnerTabKey,
    activeWorkspaceTabKey,
    clearSavedEnvironmentDirtyState,
    clearSavedRunnerDirtyState,
    clearSharedRequestDirtyState,
    clearSavedRequestDirtyState,
    createRendererState,
    environmentSnapshot,
    isActiveEnvironmentTab,
    isActiveRequestTab,
    isActiveRunnerTab,
    isActiveWorkspaceTab,
    openModalState,
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
