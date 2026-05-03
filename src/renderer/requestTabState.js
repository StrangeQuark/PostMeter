(function attachRequestTabState(global) {
  const rendererState = global.PostMeterRendererState || require('./rendererState');

  function createRequestTabState(options = {}) {
    const state = options.state;
    const activeCollection = options.activeCollection || (() => null);
    const activeEnvironment = options.activeEnvironment || (() => null);
    const activeRequest = options.activeRequest || (() => null);
    const activeWorkspaceItem = options.activeWorkspaceItem || (() => null);
    const clearActiveWorkspaceItem = options.clearActiveWorkspaceItem || (() => {});
    const collectEnvironmentFromEditor = options.collectEnvironmentFromEditor || (() => {});
    const collectRequestFromEditor = options.collectRequestFromEditor || (() => {});
    const findRequest = options.findRequest || (() => null);
    const notifyUser = options.notifyUser || (() => {});
    const persistWorkspace = options.persistWorkspace || (async () => true);
    const promptUnsavedRequestClose = options.promptUnsavedRequestClose || (async () => 'cancel');
    const removeRequestFromCollection = options.removeRequestFromCollection || (() => false);
    const renderAll = options.renderAll || (() => {});
    const renderCollections = options.renderCollections || (() => {});
    const renderRequestTabs = options.renderRequestTabs || (() => {});
    const saveDraftRequestWithPrompt = options.saveDraftRequestWithPrompt || (async () => null);
    const selectEnvironmentTabCallback = options.selectEnvironmentTab || (() => {});
    const selectRequestTabCallback = options.selectRequestTab || (() => {});
    const selectWorkspaceTabCallback = options.selectWorkspaceTab || (() => {});
    const setStatus = options.setStatus || (() => {});
    const workspaceListItems = options.workspaceListItems || (() => []);

    function requestForTab(tab) {
      if (!tab) {
        return null;
      }
      if (tab.draft) {
        return state.draftRequests.get(tab.requestId) || null;
      }
      const collection = state.workspace?.collections?.find((item) => item.id === tab.collectionId);
      return collection ? findRequest(collection, tab.requestId)?.request || null : null;
    }

    function environmentForTab(tab) {
      return state.workspace?.environments?.find((environment) => environment.id === tab?.environmentId) || null;
    }

    function workspaceForTab(tab) {
      return workspaceListItems().find((item) => item.id === tab?.workspaceId) || null;
    }

    function requestTabHasSharedDirtyState(tab) {
      const collectionOwner = tab?.collectionId && state.collectionDirtyOwners instanceof Map
        ? state.collectionDirtyOwners.get(tab.collectionId)
        : '';
      const collectionDirty = Boolean(
        tab?.collectionId
        && state.collectionDirtySnapshots instanceof Map
        && state.collectionDirtySnapshots.has(tab.collectionId)
        && collectionOwner === tab.key
      );
      const cookieDirty = Boolean(
        state.cookieJarDirtySnapshot != null
        && state.cookieJarDirtyOwner === tab?.key
      );
      return collectionDirty || cookieDirty;
    }

    function restoreCollectionVariablesSnapshot(collectionId, ownerKey = '') {
      if (!collectionId || !(state.collectionDirtySnapshots instanceof Map) || !state.collectionDirtySnapshots.has(collectionId)) {
        return false;
      }
      if (ownerKey && state.collectionDirtyOwners instanceof Map && state.collectionDirtyOwners.get(collectionId) !== ownerKey) {
        return false;
      }
      const snapshot = state.collectionDirtySnapshots.get(collectionId);
      state.collectionDirtySnapshots.delete(collectionId);
      if (state.collectionDirtyOwners instanceof Map) {
        state.collectionDirtyOwners.delete(collectionId);
      }
      const collection = state.workspace?.collections?.find((item) => item.id === collectionId);
      if (!collection) {
        return true;
      }
      try {
        collection.variables = JSON.parse(snapshot);
      } catch {
        collection.variables = [];
      }
      return true;
    }

    function restoreCookieJarSnapshot(ownerKey = '') {
      if (state.cookieJarDirtySnapshot == null) {
        return false;
      }
      if (ownerKey && state.cookieJarDirtyOwner !== ownerKey) {
        return false;
      }
      const snapshot = state.cookieJarDirtySnapshot;
      state.cookieJarDirtySnapshot = null;
      state.cookieJarDirtyOwner = '';
      try {
        state.workspace.cookies = JSON.parse(snapshot);
      } catch {
        state.workspace.cookies = [];
      }
      return true;
    }

    function restoreSharedRequestState(tab) {
      const ownerKey = tab?.key || '';
      const restoredCollection = restoreCollectionVariablesSnapshot(tab?.collectionId, ownerKey);
      const restoredCookies = restoreCookieJarSnapshot(ownerKey);
      return restoredCollection || restoredCookies;
    }

    function reportCloseSaveFailure(title, error) {
      const message = error?.message || String(error || 'Unknown error');
      setStatus(`${title}: ${message}`);
      notifyUser(title, message);
      renderRequestTabs();
    }

    function pruneOpenTabs() {
      state.openRequestTabs = state.openRequestTabs.filter((tab) => Boolean(requestForTab(tab)));
      state.openEnvironmentTabs = state.openEnvironmentTabs.filter((tab) => Boolean(environmentForTab(tab)));
      state.openWorkspaceTabs = state.openWorkspaceTabs.filter((tab) => Boolean(workspaceForTab(tab)));
    }

    function trimTabs(fieldName, activeKey) {
      while (state[fieldName].length > state.maxOpenRequestTabs) {
        const removableIndex = state[fieldName].findIndex((tab) => tab.key !== activeKey);
        state[fieldName].splice(removableIndex >= 0 ? removableIndex : 0, 1);
      }
    }

    function ensureOpenEnvironmentTabForActive(config = {}) {
      const environment = activeEnvironment();
      if (!environment || state.activeEnvironmentId === 'none') {
        return null;
      }
      const key = rendererState.activeEnvironmentTabKey(state);
      let tab = state.openEnvironmentTabs.find((candidate) => candidate.key === key);
      if (!tab) {
        tab = {
          key,
          environmentId: state.activeEnvironmentId,
          dirty: config.dirty === true,
          createdUnsaved: config.createdUnsaved === true,
          snapshot: rendererState.environmentSnapshot(environment)
        };
        state.openEnvironmentTabs.push(tab);
      }
      tab.environmentId = state.activeEnvironmentId;
      tab.snapshot ||= rendererState.environmentSnapshot(environment);
      if (config.createdUnsaved === true) {
        tab.createdUnsaved = true;
      }
      if (config.dirty === true) {
        tab.dirty = true;
      }
      trimTabs('openEnvironmentTabs', key);
      renderRequestTabs();
      return tab;
    }

    function ensureOpenWorkspaceTabForActive(config = {}) {
      const workspaceItem = activeWorkspaceItem();
      if (!workspaceItem) {
        return null;
      }
      const key = rendererState.activeWorkspaceTabKey(state);
      let tab = state.openWorkspaceTabs.find((candidate) => candidate.key === key);
      if (!tab) {
        tab = {
          key,
          workspaceId: workspaceItem.id,
          dirty: config.dirty === true
        };
        state.openWorkspaceTabs.push(tab);
      }
      tab.workspaceId = workspaceItem.id;
      if (config.dirty === true) {
        tab.dirty = true;
      }
      trimTabs('openWorkspaceTabs', key);
      renderRequestTabs();
      return tab;
    }

    function ensureOpenRequestTabForActive(config = {}) {
      const request = activeRequest();
      if (!request || !state.activeRequestId) {
        return null;
      }
      const key = rendererState.activeRequestTabKey(state);
      let tab = state.openRequestTabs.find((candidate) => candidate.key === key);
      if (!tab) {
        tab = state.activeCollectionId
          ? {
              key,
              collectionId: state.activeCollectionId,
              requestId: state.activeRequestId,
              draft: false,
              dirty: false,
              createdUnsaved: config.createdUnsaved === true,
              snapshot: rendererState.requestSnapshot(request)
            }
          : {
              key,
              collectionId: null,
              requestId: state.activeRequestId,
              draft: true,
              dirty: true
            };
        state.openRequestTabs.push(tab);
      }
      if (state.activeCollectionId) {
        const found = findRequest(activeCollection(), state.activeRequestId);
        tab.collectionId = state.activeCollectionId;
        tab.folderId = found?.folder?.id || null;
        tab.draft = false;
        tab.snapshot ||= rendererState.requestSnapshot(request);
        if (config.createdUnsaved === true) {
          tab.createdUnsaved = true;
        }
      } else {
        tab.collectionId = null;
        tab.folderId = null;
        tab.draft = true;
      }
      if (config.dirty === true || tab.draft) {
        tab.dirty = true;
      }
      trimTabs('openRequestTabs', key);
      renderRequestTabs();
      return tab;
    }

    function selectRequestTab(tab) {
      collectRequestFromEditor();
      state.activeSidebarPanel = 'collections';
      state.activeMainPanel = 'request';
      if (tab.draft) {
        const draft = state.draftRequests.get(tab.requestId);
        if (!draft) {
          removeOpenRequestTab(tab.key);
          renderAll();
          return;
        }
        state.activeCollectionId = null;
        state.activeFolderId = null;
        state.activeRequestId = draft.id;
        renderAll();
        return;
      }
      const collection = state.workspace?.collections?.find((item) => item.id === tab.collectionId);
      const found = collection ? findRequest(collection, tab.requestId) : null;
      if (!collection || !found) {
        removeOpenRequestTab(tab.key);
        renderAll();
        return;
      }
      state.activeCollectionId = collection.id;
      state.activeFolderId = found.folder?.id || null;
      state.activeRequestId = found.request.id;
      ensureOpenRequestTabForActive();
      renderAll();
    }

    function selectEnvironmentTab(tab) {
      const environment = environmentForTab(tab);
      if (!environment) {
        removeOpenEnvironmentTab(tab.key);
        renderAll();
        return;
      }
      state.activeEnvironmentId = environment.id;
      state.activeSidebarPanel = 'environments';
      state.activeMainPanel = 'environment';
      ensureOpenEnvironmentTabForActive();
      renderAll();
    }

    function selectWorkspaceTab(tab) {
      const workspaceItem = workspaceForTab(tab);
      if (!workspaceItem) {
        removeOpenWorkspaceTab(tab.key);
        renderAll();
        return;
      }
      state.selectedWorkspaceId = workspaceItem.id;
      state.activeSidebarPanel = 'workspaces';
      state.activeMainPanel = 'workspace';
      ensureOpenWorkspaceTabForActive();
      renderAll();
    }

    function markActiveRequestDirty() {
      const tab = ensureOpenRequestTabForActive({ dirty: true });
      if (tab) {
        tab.dirty = true;
        renderRequestTabs();
      }
    }

    function markActiveEnvironmentDirty() {
      const tab = ensureOpenEnvironmentTabForActive({ dirty: true });
      if (tab) {
        tab.dirty = true;
        renderRequestTabs();
      }
    }

    function removeOpenRequestTab(keyOrCollectionId, requestId) {
      const key = requestId == null ? keyOrCollectionId : `request:${keyOrCollectionId}:${requestId}`;
      state.openRequestTabs = state.openRequestTabs.filter((tab) => tab.key !== key);
    }

    function removeOpenRequestTabsForCollection(collectionId) {
      state.openRequestTabs = state.openRequestTabs.filter((tab) => tab.collectionId !== collectionId);
    }

    function removeOpenEnvironmentTab(keyOrEnvironmentId) {
      const key = String(keyOrEnvironmentId || '').startsWith('environment:')
        ? keyOrEnvironmentId
        : `environment:${keyOrEnvironmentId}`;
      state.openEnvironmentTabs = state.openEnvironmentTabs.filter((tab) => tab.key !== key);
    }

    function removeOpenWorkspaceTab(keyOrWorkspaceId) {
      const key = String(keyOrWorkspaceId || '').startsWith('workspace:')
        ? keyOrWorkspaceId
        : `workspace:${keyOrWorkspaceId}`;
      state.openWorkspaceTabs = state.openWorkspaceTabs.filter((tab) => tab.key !== key);
    }

    async function closeWorkspaceTab(tab) {
      if (!tab) {
        renderRequestTabs();
        return;
      }
      const index = state.openWorkspaceTabs.findIndex((candidate) => candidate === tab || candidate.key === tab.key);
      if (index < 0) {
        renderRequestTabs();
        return;
      }
      const wasActive = rendererState.isActiveWorkspaceTab(state, tab);
      state.openWorkspaceTabs.splice(index, 1);
      if (!wasActive) {
        renderRequestTabs();
        return;
      }
      const fallbackEnvironment = state.openEnvironmentTabs[state.openEnvironmentTabs.length - 1] || null;
      if (fallbackEnvironment) {
        selectEnvironmentTabCallback(fallbackEnvironment);
        return;
      }
      const fallbackRequest = state.openRequestTabs[state.openRequestTabs.length - 1] || null;
      if (fallbackRequest) {
        selectRequestTabCallback(fallbackRequest);
        return;
      }
      state.selectedWorkspaceId = null;
      state.activeSidebarPanel = 'workspaces';
      state.activeMainPanel = 'workspace';
      renderAll();
    }

    async function closeEnvironmentTab(tab) {
      if (!tab) {
        renderRequestTabs();
        return;
      }
      const wasActive = rendererState.isActiveEnvironmentTab(state, tab);
      if (rendererState.isActiveEnvironmentTab(state, tab)) {
        collectEnvironmentFromEditor();
      }
      const environment = environmentForTab(tab);
      if (!environment) {
        closeEnvironmentTabAfterResolved(tab, { wasActive });
        return;
      }
      if (tab.dirty) {
        const action = await promptUnsavedRequestClose(tab, environment);
        if (action === 'cancel') {
          return;
        }
        if (action === 'save') {
          try {
            await persistWorkspace(false, { environmentTabKey: tab.key });
          } catch (error) {
            reportCloseSaveFailure('Environment Save Failed', error);
            return;
          }
        } else {
          discardEnvironmentTabChanges(tab);
        }
      }
      closeEnvironmentTabAfterResolved(tab, { wasActive });
    }

    function closeEnvironmentTabAfterResolved(tab, options = {}) {
      const index = state.openEnvironmentTabs.findIndex((candidate) => candidate === tab || candidate.key === tab.key);
      if (index < 0) {
        renderRequestTabs();
        return;
      }
      const wasActive = options.wasActive === true || rendererState.isActiveEnvironmentTab(state, tab);
      state.openEnvironmentTabs.splice(index, 1);
      if (!wasActive) {
        renderRequestTabs();
        return;
      }
      const fallbackEnvironment = state.openEnvironmentTabs[Math.min(index, state.openEnvironmentTabs.length - 1)] || state.openEnvironmentTabs[index - 1] || null;
      if (fallbackEnvironment) {
        selectEnvironmentTabCallback(fallbackEnvironment);
        return;
      }
      const fallbackWorkspace = state.openWorkspaceTabs[state.openWorkspaceTabs.length - 1] || null;
      if (fallbackWorkspace) {
        selectWorkspaceTabCallback(fallbackWorkspace);
        return;
      }
      const fallbackRequest = state.openRequestTabs[state.openRequestTabs.length - 1] || null;
      if (fallbackRequest) {
        selectRequestTabCallback(fallbackRequest);
        return;
      }
      state.activeEnvironmentId = 'none';
      state.activeSidebarPanel = 'environments';
      state.activeMainPanel = 'environment';
      renderAll();
    }

    function discardEnvironmentTabChanges(tab) {
      if (tab.createdUnsaved) {
        state.workspace.environments = (state.workspace.environments || []).filter((environment) => environment.id !== tab.environmentId);
        if (state.activeEnvironmentId === tab.environmentId) {
          state.activeEnvironmentId = state.workspace.environments[0]?.id || 'none';
        }
        return;
      }
      restoreEnvironmentFromSnapshot(tab);
    }

    function restoreEnvironmentFromSnapshot(tab) {
      const environment = environmentForTab(tab);
      if (!environment || !tab.snapshot) {
        return;
      }
      try {
        const snapshot = JSON.parse(tab.snapshot);
        for (const key of Object.keys(environment)) {
          delete environment[key];
        }
        Object.assign(environment, snapshot);
      } catch {
        return;
      }
    }

    async function closeRequestTab(tab) {
      if (!tab) {
        return;
      }
      if (rendererState.isActiveRequestTab(state, tab)) {
        collectRequestFromEditor();
      }
      const request = requestForTab(tab);
      if (!request) {
        closeRequestTabAfterResolved(tab);
        return;
      }
      if (tab.draft || tab.dirty || requestTabHasSharedDirtyState(tab)) {
        const action = await promptUnsavedRequestClose(tab, request);
        if (action === 'cancel') {
          return;
        }
        let restoredSharedState = false;
        if (action === 'save') {
          if (tab.draft) {
            let savedTab = null;
            try {
              savedTab = await saveDraftRequestWithPrompt(request, { showStatus: false, tab });
            } catch (error) {
              reportCloseSaveFailure('Request Save Failed', error);
              return;
            }
            if (!savedTab) {
              return;
            }
          } else {
            try {
              await persistWorkspace(false, { requestTabKey: tab.key });
            } catch (error) {
              reportCloseSaveFailure('Request Save Failed', error);
              return;
            }
          }
        } else {
          restoredSharedState = discardRequestTabChanges(tab);
        }
        closeRequestTabAfterResolved(tab, { forceRenderAll: restoredSharedState });
        return;
      }
      closeRequestTabAfterResolved(tab);
    }

    function closeRequestTabAfterResolved(tab, options = {}) {
      const index = state.openRequestTabs.findIndex((candidate) => candidate === tab || candidate.key === tab.key);
      if (index < 0) {
        renderRequestTabs();
        return;
      }
      const wasActive = rendererState.isActiveRequestTab(state, tab);
      state.openRequestTabs.splice(index, 1);
      if (!wasActive) {
        if (options.forceRenderAll === true) {
          renderAll();
        } else {
          renderCollections();
          renderRequestTabs();
        }
        return;
      }
      const fallback = state.openRequestTabs[Math.min(index, state.openRequestTabs.length - 1)] || state.openRequestTabs[index - 1] || null;
      if (fallback) {
        selectRequestTabCallback(fallback);
        return;
      }
      clearActiveWorkspaceItem();
      renderAll();
    }

    function discardRequestTabChanges(tab) {
      let restoredSharedState = restoreSharedRequestState(tab);
      if (tab.draft) {
        state.draftRequests.delete(tab.requestId);
        return restoredSharedState;
      }
      const collection = state.workspace?.collections?.find((item) => item.id === tab.collectionId);
      if (!collection) {
        return restoredSharedState;
      }
      if (tab.createdUnsaved) {
        removeRequestFromCollection(collection, tab.requestId);
        return true;
      }
      restoreRequestFromSnapshot(tab);
      return restoredSharedState;
    }

    function restoreRequestFromSnapshot(tab) {
      const request = requestForTab(tab);
      if (!request || !tab.snapshot) {
        return;
      }
      try {
        const snapshot = JSON.parse(tab.snapshot);
        for (const key of Object.keys(request)) {
          delete request[key];
        }
        Object.assign(request, snapshot);
      } catch {
        return;
      }
    }

    return {
      closeEnvironmentTab,
      closeRequestTab,
      closeWorkspaceTab,
      ensureOpenEnvironmentTabForActive,
      ensureOpenRequestTabForActive,
      ensureOpenWorkspaceTabForActive,
      environmentForTab,
      markActiveEnvironmentDirty,
      markActiveRequestDirty,
      pruneOpenTabs,
      removeOpenEnvironmentTab,
      removeOpenRequestTab,
      removeOpenRequestTabsForCollection,
      removeOpenWorkspaceTab,
      requestForTab,
      selectEnvironmentTab,
      selectRequestTab,
      selectWorkspaceTab,
      workspaceForTab
    };
  }

  const exported = {
    createRequestTabState
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterRequestTabState = exported;
})(typeof window === 'undefined' ? globalThis : window);
