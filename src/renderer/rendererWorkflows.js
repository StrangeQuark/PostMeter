(function attachRendererWorkflows(global) {
  function createRendererWorkflows(options = {}) {
    const state = options.state;
    const doc = options.doc || document;
    const windowObject = options.windowObject || window;
    const runFormatting = options.runFormatting || global.PostMeterRunFormatting || require('./runResultFormatting');
    const activeCollection = options.activeCollection || (() => null);
    const activeEnvironment = options.activeEnvironment || (() => null);
    const activeRequest = options.activeRequest || (() => null);
    const applyLoadedWorkspace = typeof options.applyLoadedWorkspace === 'function'
      ? options.applyLoadedWorkspace
      : null;
    const applyWorkspaceCatalogUpdate = typeof options.applyWorkspaceCatalogUpdate === 'function'
      ? options.applyWorkspaceCatalogUpdate
      : null;
    const promptForCollectionExport = typeof options.promptForCollectionExport === 'function'
      ? options.promptForCollectionExport
      : null;
    const applyPostmanCookieMetadata = options.applyPostmanCookieMetadata || ((cookie) => cookie);
    const collectCollectionFromEditor = options.collectCollectionFromEditor || (() => {});
    const collectEnvironmentFromEditor = options.collectEnvironmentFromEditor || (() => {});
    const collectRequestFromEditor = options.collectRequestFromEditor || (() => {});
    const collectSettingsFromEditor = options.collectSettingsFromEditor || (() => {});
    const displayResponse = options.displayResponse || (() => {});
    const displayTestResults = options.displayTestResults || (() => {});
    const domainFromRequestUrl = options.domainFromRequestUrl || (() => '');
    const notifyUser = options.notifyUser || (() => {});
    const parseCookieHeaderForJar = options.parseCookieHeaderForJar || (() => []);
    const postmanCookieMetadataByName = options.postmanCookieMetadataByName || (() => new Map());
    const renderAll = options.renderAll || (() => {});
    const renderAuthEditor = options.renderAuthEditor || (() => {});
    const renderCollectionVariablesEditor = options.renderCollectionVariablesEditor || (() => {});
    const renderCollections = options.renderCollections || (() => {});
    const renderCookieJarEditor = options.renderCookieJarEditor || (() => {});
    const renderEnvironmentEditor = options.renderEnvironmentEditor || (() => {});
    const renderHistory = options.renderHistory || (() => {});
    const renderRequestVariablePairs = options.renderRequestVariablePairs || (() => {});
    const renderVariablePreview = options.renderVariablePreview || (() => {});
    const renderRequestTabs = options.renderRequestTabs || (() => {});
    const saveDraftRequestWithPrompt = options.saveDraftRequestWithPrompt || (async () => null);
    const selectFirstRequest = options.selectFirstRequest || (() => {});
    const selectInitialWorkspaceItem = options.selectInitialWorkspaceItem || (() => {});
    const setStatus = options.setStatus || (() => {});
    const uniqueName = options.uniqueName || ((baseName) => baseName);
    const walkCollectionRequests = options.walkCollectionRequests || walkRequestsInCollection;

    function element(id) {
      return doc.getElementById(id);
    }

    function clearFailedResponseDetails(message) {
      state.lastResponse = null;
      element('responseStatus').textContent = 'ERR';
      element('responseTime').textContent = '-';
      element('responseSize').textContent = '-';
      element('finalUrl').textContent = '-';
      element('responseHeaders').value = '';
      element('responseCookies').value = '';
      element('responseBody').value = message;
      if (element('visualizerFrame')) {
        element('visualizerFrame').srcdoc = '';
      }
      displayTestResults(null);
    }

    function clearRunnerResultState() {
      state.lastRunnerResult = null;
      element('exportRunnerJsonButton').disabled = true;
      element('exportRunnerCsvButton').disabled = true;
    }

    async function confirmAction(message) {
      if (typeof options.confirm === 'function') {
        return await options.confirm(message);
      }
      setStatus(String(message || 'Action requires confirmation.'));
      return false;
    }

    function runtimeId() {
      const cryptoApi = windowObject.crypto || globalThis.crypto;
      if (typeof cryptoApi?.randomUUID === 'function') {
        return cryptoApi.randomUUID();
      }
      return `runtime-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    async function promptInput(message, defaultValue = '') {
      if (typeof options.prompt === 'function') {
        return await options.prompt(message, defaultValue);
      }
      setStatus(String(message || 'Action requires input.'));
      return '';
    }

    function collectActiveEditorState() {
      if (state?.activeMainPanel === 'environment') {
        collectEnvironmentFromEditor();
        return;
      }
      if (state?.activeMainPanel === 'request') {
        collectRequestFromEditor();
      }
    }

    function walkRequestsInCollection(collection, visitor) {
      for (const request of collection?.requests || []) {
        visitor(request);
      }
      for (const folder of collection?.folders || []) {
        walkRequestsInFolder(folder, visitor);
      }
    }

    function walkRequestsInFolder(folder, visitor) {
      for (const request of folder?.requests || []) {
        visitor(request);
      }
      for (const child of folder?.folders || []) {
        walkRequestsInFolder(child, visitor);
      }
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

    function cloneJson(value, fallback = null) {
      if (value == null) {
        return fallback;
      }
      if (typeof structuredClone === 'function') {
        return structuredClone(value);
      }
      return JSON.parse(JSON.stringify(value));
    }

    function parseSnapshot(snapshot, fallback) {
      try {
        return JSON.parse(snapshot);
      } catch {
        return fallback;
      }
    }

    function currentRequestTabKey() {
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

    function currentEnvironmentTabKey() {
      return state?.activeEnvironmentId && state.activeEnvironmentId !== 'none'
        ? `environment:${state.activeEnvironmentId}`
        : '';
    }

    function createRequestContext(request, environment = null) {
      return {
        workspaceId: state.activeWorkspaceId,
        collectionId: state.activeCollectionId || null,
        runnerId: state.activeRunnerRequestRunnerId || null,
        requestId: request?.id || null,
        environmentId: environment?.id || null
      };
    }

    function isActiveWorkspaceContext(context) {
      return Boolean(context && context.workspaceId === state.activeWorkspaceId);
    }

    function findWorkspaceCollection(collectionId) {
      return (state.workspace?.collections || []).find((collection) => collection.id === collectionId) || null;
    }

    function findWorkspaceEnvironment(environmentId) {
      return (state.workspace?.environments || []).find((environment) => environment.id === environmentId) || null;
    }

    function findWorkspaceRunner(runnerId) {
      return (state.workspace?.runners || []).find((runner) => runner.id === runnerId) || null;
    }

    function findContextRequest(context) {
      if (!context?.requestId || !isActiveWorkspaceContext(context)) {
        return null;
      }
      if (context.runnerId) {
        const runner = findWorkspaceRunner(context.runnerId);
        return (runner?.requests || []).find((request) => request.id === context.requestId) || null;
      }
      if (!context.collectionId) {
        return state.draftRequests?.get(context.requestId) || null;
      }
      const collection = findWorkspaceCollection(context.collectionId);
      if (!collection) {
        return null;
      }
      let matchedRequest = null;
      walkCollectionRequests(collection, (request) => {
        if (!matchedRequest && request.id === context.requestId) {
          matchedRequest = request;
        }
      });
      return matchedRequest;
    }

    function requestTabKey(context) {
      if (!context?.requestId) {
        return '';
      }
      if (context.runnerId) {
        return `runner-request:${context.runnerId}:${context.requestId}`;
      }
      return context.collectionId
        ? `request:${context.collectionId}:${context.requestId}`
        : `draft:${context.requestId}`;
    }

    function environmentTabKey(context) {
      return context?.environmentId && context.environmentId !== 'none'
        ? `environment:${context.environmentId}`
        : '';
    }

    function collectionTabKey(context) {
      return context?.collectionId && !context.requestId
        ? `collection:${context.collectionId}`
        : '';
    }

    function resolveRequestSaveTarget(config = {}) {
      if (typeof config.requestTabKey === 'string') {
        return config.requestTabKey;
      }
      if (config.scope === 'all' || config.scope === 'runners' || typeof config.collectionTabKey === 'string') {
        return '';
      }
      if (typeof config.environmentTabKey === 'string') {
        return '';
      }
      return state?.activeMainPanel === 'request' ? currentRequestTabKey() : '';
    }

    function resolveCollectionSaveTarget(config = {}) {
      if (typeof config.collectionTabKey === 'string') {
        return config.collectionTabKey;
      }
      if (config.scope === 'all' || config.scope === 'runners') {
        return '';
      }
      if (typeof config.requestTabKey === 'string' || typeof config.environmentTabKey === 'string') {
        return '';
      }
      return state?.activeMainPanel === 'request' && state.activeCollectionId && !state.activeRequestId
        ? collectionTabKey({ collectionId: state.activeCollectionId })
        : '';
    }

    function resolveEnvironmentSaveTarget(config = {}) {
      if (typeof config.environmentTabKey === 'string') {
        return config.environmentTabKey;
      }
      if (config.scope === 'all') {
        return '';
      }
      if (typeof config.requestTabKey === 'string' || typeof config.collectionTabKey === 'string') {
        return '';
      }
      return state?.activeMainPanel === 'environment' ? currentEnvironmentTabKey() : '';
    }

    function requestTabForKey(tabKey) {
      return (state.openRequestTabs || []).find((tab) => tab.key === tabKey) || null;
    }

    function collectionTabForKey(tabKey) {
      return (state.openCollectionTabs || []).find((tab) => tab.key === tabKey) || null;
    }

    function environmentTabForKey(tabKey) {
      return (state.openEnvironmentTabs || []).find((tab) => tab.key === tabKey) || null;
    }

    function findRequestLocationInWorkspace(workspaceValue, collectionId, requestId) {
      if (!collectionId || !requestId) {
        return null;
      }
      const collection = (workspaceValue?.collections || []).find((item) => item.id === collectionId);
      if (!collection) {
        return null;
      }
      function search(container) {
        const requests = Array.isArray(container?.requests) ? container.requests : [];
        const index = requests.findIndex((request) => request.id === requestId);
        if (index >= 0) {
          return {
            container,
            index,
            request: requests[index]
          };
        }
        for (const folder of container?.folders || []) {
          const found = search(folder);
          if (found) {
            return found;
          }
        }
        return null;
      }
      return search(collection);
    }

    function revertRequestTabInWorkspace(workspaceValue, tab) {
      if (!tab?.collectionId || !tab?.requestId) {
        return false;
      }
      const location = findRequestLocationInWorkspace(workspaceValue, tab.collectionId, tab.requestId);
      if (!location) {
        return false;
      }
      if (tab.createdUnsaved === true) {
        location.container.requests.splice(location.index, 1);
        return true;
      }
      if (!tab.snapshot) {
        return false;
      }
      const snapshot = parseSnapshot(tab.snapshot, null);
      if (!snapshot) {
        return false;
      }
      location.container.requests[location.index] = snapshot;
      return true;
    }

    function requestForTabInWorkspace(workspaceValue, tab) {
      if (!workspaceValue || !tab?.requestId) {
        return null;
      }
      if (tab.runnerRequest === true || tab.runnerId) {
        const runner = (workspaceValue.runners || []).find((item) => item.id === tab.runnerId);
        return (runner?.requests || []).find((request) => request.id === tab.requestId) || null;
      }
      if (!tab.collectionId) {
        return null;
      }
      return findRequestLocationInWorkspace(workspaceValue, tab.collectionId, tab.requestId)?.request || null;
    }

    function findEnvironmentIndexInWorkspace(workspaceValue, environmentId) {
      if (!environmentId) {
        return -1;
      }
      return (workspaceValue?.environments || []).findIndex((environment) => environment.id === environmentId);
    }

    function revertEnvironmentTabInWorkspace(workspaceValue, tab) {
      const index = findEnvironmentIndexInWorkspace(workspaceValue, tab?.environmentId);
      if (index < 0) {
        return false;
      }
      if (tab.createdUnsaved === true) {
        workspaceValue.environments.splice(index, 1);
        return true;
      }
      if (!tab.snapshot) {
        return false;
      }
      const snapshot = parseSnapshot(tab.snapshot, null);
      if (!snapshot) {
        return false;
      }
      workspaceValue.environments[index] = snapshot;
      return true;
    }

    function environmentForTabInWorkspace(workspaceValue, tab) {
      const index = findEnvironmentIndexInWorkspace(workspaceValue, tab?.environmentId);
      return index >= 0 ? workspaceValue.environments[index] : null;
    }

    function findCollectionIndexInWorkspace(workspaceValue, collectionId) {
      if (!collectionId) {
        return -1;
      }
      return (workspaceValue?.collections || []).findIndex((collection) => collection.id === collectionId);
    }

    function collectionForTabInWorkspace(workspaceValue, tab) {
      const index = findCollectionIndexInWorkspace(workspaceValue, tab?.collectionId);
      return index >= 0 ? workspaceValue.collections[index] : null;
    }

    function replaceObject(target, nextValue) {
      if (!target || !nextValue) {
        return;
      }
      const source = target === nextValue
        ? cloneJson(nextValue, {})
        : nextValue;
      for (const key of Object.keys(target)) {
        delete target[key];
      }
      Object.assign(target, source);
    }

    function clonePairArray(pairs) {
      return Array.isArray(pairs) ? pairs.map((pair) => ({ ...pair })) : [];
    }

    function cloneValueArray(values) {
      return Array.isArray(values) ? values.map((value) => ({ ...value })) : [];
    }

    function findFolderPath(collection, folderId, parentPath = []) {
      for (const folder of collection?.folders || []) {
        const nextPath = [...parentPath, { id: folder.id, name: folder.name }];
        if (folder.id === folderId) {
          return nextPath;
        }
        const nestedPath = findFolderPath(folder, folderId, nextPath);
        if (nestedPath) {
          return nestedPath;
        }
      }
      return null;
    }

    function requestFolderPath(collection, folderId) {
      if (!collection || !folderId) {
        return [];
      }
      return findFolderPath(collection, folderId) || [];
    }

    function buildRequestSavePayload(requestTab) {
      if (requestTab?.runnerRequest === true || requestTab?.runnerId) {
        return buildRunnerRequestSavePayload(requestTab);
      }
      const collection = findWorkspaceCollection(requestTab?.collectionId);
      const request = requestForTabInWorkspace(state.workspace, requestTab);
      if (!collection || !request) {
        throw new Error('The selected request could not be found for saving.');
      }
      const payload = {
        collectionId: requestTab.collectionId,
        requestId: requestTab.requestId,
        folderId: requestTab.folderId || '',
        createdUnsaved: requestTab.createdUnsaved === true,
        request,
        settings: cloneJson(state.workspace?.settings, {}),
        collectionShell: {
          id: collection.id,
          name: collection.name,
          description: collection.description || '',
          auth: cloneJson(collection.auth || { type: 'none' }, { type: 'none' }),
          scripts: cloneJson(collection.scripts || {}, {}),
          certificates: cloneValueArray(collection.certificates)
        },
        folderPath: requestFolderPath(collection, requestTab.folderId)
      };
      const collectionOwner = state.collectionDirtyOwners instanceof Map
        ? state.collectionDirtyOwners.get(collection.id)
        : '';
      if (collectionOwner === requestTab.key) {
        payload.collectionVariables = clonePairArray(collection.variables);
      }
      if (state.cookieJarDirtyOwner === requestTab.key) {
        payload.cookies = cloneValueArray(state.workspace?.cookies);
      }
      return payload;
    }

    function buildRunnerRequestSavePayload(requestTab) {
      const runner = findWorkspaceRunner(requestTab?.runnerId);
      const request = requestForTabInWorkspace(state.workspace, requestTab);
      if (!runner || !request) {
        throw new Error('The selected runner request could not be found for saving.');
      }
      return {
        runnerId: requestTab.runnerId,
        requestId: requestTab.requestId,
        request,
        runnerShell: {
          id: runner.id,
          name: runner.name,
          environmentId: runner.environmentId || 'none',
          stopOnFailure: runner.stopOnFailure === true,
          allowEnvironmentMutation: runner.allowEnvironmentMutation === true
        },
        settings: cloneJson(state.workspace?.settings, {})
      };
    }

    function buildEnvironmentSavePayload(environmentTab) {
      const environment = environmentForTabInWorkspace(state.workspace, environmentTab);
      if (!environment) {
        throw new Error('The selected environment could not be found for saving.');
      }
      return {
        environmentId: environmentTab.environmentId,
        createdUnsaved: environmentTab.createdUnsaved === true,
        environment,
        settings: cloneJson(state.workspace?.settings, {})
      };
    }

    function buildCollectionSavePayload(collectionTab) {
      const collection = collectionForTabInWorkspace(state.workspace, collectionTab);
      if (!collection) {
        throw new Error('The selected collection could not be found for saving.');
      }
      return {
        collectionId: collectionTab.collectionId,
        createdUnsaved: collectionTab.createdUnsaved === true,
        collection,
        settings: cloneJson(state.workspace?.settings, {})
      };
    }

    function buildWorkspaceSettingsSavePayload() {
      return cloneJson(state.workspace?.settings, {});
    }

    function clearSavedSharedRequestState(requestTabKeyValue, config = {}) {
      let cleared = false;
      if (config.collection === true && requestTabKeyValue && state.collectionDirtySnapshots instanceof Map && state.collectionDirtyOwners instanceof Map) {
        for (const [collectionId, owner] of Array.from(state.collectionDirtyOwners.entries())) {
          if (owner === requestTabKeyValue) {
            state.collectionDirtyOwners.delete(collectionId);
            state.collectionDirtySnapshots.delete(collectionId);
            cleared = true;
          }
        }
      }
      if (config.cookies === true && requestTabKeyValue && state.cookieJarDirtySnapshot != null && state.cookieJarDirtyOwner === requestTabKeyValue) {
        state.cookieJarDirtySnapshot = null;
        state.cookieJarDirtyOwner = '';
        cleared = true;
      }
      return cleared;
    }

    function applySavedRequestResult(requestTab, result) {
      const request = requestForTabInWorkspace(state.workspace, requestTab);
      if (!request || !result?.request) {
        return false;
      }
      replaceObject(request, result.request);
      const collection = findWorkspaceCollection(requestTab.collectionId);
      if (collection && Array.isArray(result.collectionVariables)) {
        collection.variables = clonePairArray(result.collectionVariables);
      }
      if (Array.isArray(result.cookies)) {
        state.workspace.cookies = cloneValueArray(result.cookies);
      }
      if (result.settings && typeof result.settings === 'object') {
        state.workspace.settings = cloneJson(result.settings, {});
      }
      requestTab.dirty = false;
      requestTab.createdUnsaved = false;
      requestTab.snapshot = requestSnapshot(request);
      clearSavedSharedRequestState(requestTab.key, {
        collection: Array.isArray(result.collectionVariables),
        cookies: Array.isArray(result.cookies)
      });
      renderAll();
      return true;
    }

    function applySavedEnvironmentResult(environmentTab, result) {
      const environment = environmentForTabInWorkspace(state.workspace, environmentTab);
      if (!environment || !result?.environment) {
        return false;
      }
      replaceObject(environment, result.environment);
      if (result.settings && typeof result.settings === 'object') {
        state.workspace.settings = cloneJson(result.settings, {});
      }
      environmentTab.dirty = false;
      environmentTab.createdUnsaved = false;
      environmentTab.snapshot = environmentSnapshot(environment);
      renderAll();
      return true;
    }

    function applySavedCollectionResult(collectionTab, result) {
      const collection = collectionForTabInWorkspace(state.workspace, collectionTab);
      if (!collection || !result?.collection) {
        return false;
      }
      replaceObject(collection, result.collection);
      if (result.settings && typeof result.settings === 'object') {
        state.workspace.settings = cloneJson(result.settings, {});
      }
      collectionTab.dirty = false;
      collectionTab.createdUnsaved = false;
      collectionTab.snapshot = JSON.stringify(collection);
      renderAll();
      return true;
    }

    async function persistRequestTab(requestTab) {
      const saveRequest = windowObject.__postmeterSaveRequest || windowObject.postmeter.workspace.saveRequest;
      return applySavedRequestResult(requestTab, await saveRequest(buildRequestSavePayload(requestTab)));
    }

    async function persistEnvironmentTab(environmentTab) {
      const saveEnvironment = windowObject.__postmeterSaveEnvironment || windowObject.postmeter.workspace.saveEnvironment;
      return applySavedEnvironmentResult(environmentTab, await saveEnvironment(buildEnvironmentSavePayload(environmentTab)));
    }

    async function persistCollectionTab(collectionTab) {
      const saveCollection = windowObject.__postmeterSaveCollection || windowObject.postmeter?.workspace?.saveCollection;
      if (typeof saveCollection !== 'function') {
        state.workspace = await saveWorkspaceStateOnly();
        collectionTab.dirty = false;
        collectionTab.createdUnsaved = false;
        collectionTab.snapshot = JSON.stringify(collectionForTabInWorkspace(state.workspace, collectionTab) || {});
        renderAll();
        return true;
      }
      return applySavedCollectionResult(collectionTab, await saveCollection(buildCollectionSavePayload(collectionTab)));
    }

    async function persistWorkspaceSettings() {
      const saveSettings = windowObject.__postmeterSaveWorkspaceSettings || windowObject.postmeter.workspace.saveSettings;
      const result = await saveSettings(buildWorkspaceSettingsSavePayload());
      if (result?.settings && typeof result.settings === 'object') {
        state.workspace.settings = cloneJson(result.settings, {});
      }
      return true;
    }

    function isActiveRequestContext(context) {
      return Boolean(
        context?.requestId
        && isActiveWorkspaceContext(context)
        && state.activeRequestId === context.requestId
        && (state.activeRunnerRequestRunnerId || null) === (context.runnerId || null)
        && (state.activeCollectionId || null) === (context.collectionId || null)
      );
    }

    function syncSavedRequestContext(context) {
      if (!context?.requestId || !isActiveWorkspaceContext(context)) {
        return false;
      }
      const request = findContextRequest(context);
      const tab = (state.openRequestTabs || []).find((candidate) => candidate.key === requestTabKey(context));
      if (!request || !tab) {
        return false;
      }
      tab.snapshot = requestSnapshot(request);
      tab.dirty = false;
      tab.createdUnsaved = false;
      return true;
    }

    function syncSavedEnvironmentContext(context) {
      if (!context?.environmentId || !isActiveWorkspaceContext(context)) {
        return false;
      }
      const environment = findWorkspaceEnvironment(context.environmentId);
      const tab = (state.openEnvironmentTabs || []).find((candidate) => candidate.key === environmentTabKey(context));
      if (!environment || !tab) {
        return false;
      }
      tab.snapshot = environmentSnapshot(environment);
      tab.dirty = false;
      tab.createdUnsaved = false;
      return true;
    }

    function syncSavedRequestContextTabs(context) {
      const requestUpdated = syncSavedRequestContext(context);
      const environmentUpdated = syncSavedEnvironmentContext(context);
      if (requestUpdated || environmentUpdated) {
        renderRequestTabs();
      }
    }

    async function saveWorkspaceStateOnly() {
      const save = windowObject.__postmeterSaveWorkspace || windowObject.postmeter.workspace.save;
      state.workspace = await save(state.workspace);
      return state.workspace;
    }

    async function loadPersistedRequestAuth(context) {
      if (!context?.collectionId || !context?.requestId || !isActiveWorkspaceContext(context)) {
        return null;
      }
      const loadWorkspace = windowObject.__postmeterLoadWorkspace || windowObject.postmeter?.workspace?.load;
      if (typeof loadWorkspace !== 'function') {
        return null;
      }
      let loaded;
      try {
        loaded = await loadWorkspace();
      } catch {
        return null;
      }
      if (loaded?.activeWorkspaceId && loaded.activeWorkspaceId !== state.activeWorkspaceId) {
        return null;
      }
      const persistedRequest = findRequestLocationInWorkspace(
        loaded?.workspace,
        context.collectionId,
        context.requestId
      )?.request;
      return persistedRequest?.auth ? cloneJson(persistedRequest.auth, null) : null;
    }

    function publicResponseResult(response) {
      const publicResponse = { ...(response || {}) };
      delete publicResponse.updatedAuth;
      delete publicResponse.updatedAuthPersisted;
      return publicResponse;
    }

    function validationEnvironmentForRequest(request, environment, collection = null) {
      const variables = [];
      mergeValidationVariables(variables, state.workspace?.globals || [], false);
      mergeValidationVariables(variables, environment?.variables || [], true);
      mergeValidationVariables(variables, collection?.variables || [], true);
      mergeValidationVariables(variables, request?.variables || [], true);
      return {
        id: environment?.id || 'runtime',
        name: environment?.name || 'Runtime',
        variables
      };
    }

    function mergeValidationVariables(target, source, override) {
      if (!Array.isArray(source)) {
        return;
      }
      for (const variable of source) {
        if (!variable || variable.enabled === false || !String(variable.key || '').trim()) {
          continue;
        }
        const key = String(variable.key).trim();
        const existing = target.find((item) => item.key === key);
        if (existing) {
          if (override) {
            existing.value = validationVariableValue(variable);
            existing.enabled = true;
          }
          continue;
        }
        target.push({
          enabled: true,
          key,
          value: validationVariableValue(variable)
        });
      }
    }

    function validationVariableValue(variable) {
      const value = variable?.value
        ?? variable?.currentValue
        ?? variable?.current
        ?? variable?.initialValue
        ?? variable?.initial
        ?? '';
      return value == null ? '' : String(value);
    }

    function requestWithCollectionDefaults(request, collection = null) {
      if (!request) {
        return request;
      }
      const nextRequest = { ...request };
      if (!requestHasOwnAuth(request.auth) && requestHasOwnAuth(collection?.auth)) {
        nextRequest.auth = cloneJson(collection.auth);
      }
      const scripts = { ...(request.scripts || {}) };
      const collectionScripts = collection?.scripts || {};
      let hasScriptFallback = false;
      for (const field of ['preRequest', 'tests', 'beforeQuery', 'afterResponse', 'beforeInvoke', 'onMessage', 'onIncomingMessage', 'mock']) {
        if (!String(scripts[field] || '').trim() && String(collectionScripts[field] || '').trim()) {
          scripts[field] = String(collectionScripts[field]);
          hasScriptFallback = true;
        }
      }
      if (hasScriptFallback) {
        nextRequest.scripts = scripts;
      }
      return nextRequest;
    }

    function requestHasOwnAuth(auth) {
      return Boolean(auth && typeof auth === 'object' && String(auth.type || 'none') !== 'none');
    }

    async function sendActiveRequest() {
      const request = activeRequest();
      if (!request) {
        return setStatus('Select a request before sending.');
      }
      collectRequestFromEditor();
      const environment = activeEnvironment();
      const requestContext = createRequestContext(request, environment);
      const isRunnerOwnedRequest = Boolean(requestContext.runnerId);
      try {
        if (!isRunnerOwnedRequest) {
          await saveWorkspace(false, { allowDraftBypass: true });
        }
        const collection = activeCollection();
        const effectiveRequest = requestWithCollectionDefaults(request, collection);
        if (!effectiveRequest.scripts?.preRequest?.trim()) {
          const validateRequest = windowObject.__postmeterValidateRequest || windowObject.postmeter.request.validate;
          const errors = await validateRequest(effectiveRequest, validationEnvironmentForRequest(request, environment, collection));
          if (errors.length) {
            element('validationLabel').textContent = errors.join(' ');
            return setStatus('Fix validation errors.');
          }
        }
        element('validationLabel').textContent = '';
        setStatus('Sending request...');
        const sendRequest = windowObject.__postmeterSendRequest || windowObject.postmeter.request.send;
        const response = await sendRequest(request, environment);
        const requestActuallySent = response?.requestSent !== false;
        const failedBeforeSend = !requestActuallySent && response?.preRequestScriptResult?.passed === false;
        const skippedBeforeSend = !requestActuallySent && response?.skipped === true;
        if (isActiveWorkspaceContext(requestContext)) {
          const targetRequest = findContextRequest(requestContext);
          const updatedAuth = response.updatedAuth || (response.updatedAuthPersisted
            ? await loadPersistedRequestAuth(requestContext)
            : null);
          if (updatedAuth && targetRequest) {
            targetRequest.auth = updatedAuth;
            if (isActiveRequestContext(requestContext)) {
              renderAuthEditor(targetRequest.auth);
            }
          }
          if (Array.isArray(response.updatedCookies)) {
            state.workspace.cookies = response.updatedCookies;
            renderCookieJarEditor();
          }
          applySingleRequestScriptMutations(response, requestContext);
          const publicResponse = publicResponseResult(response);
          state.lastResponse = requestActuallySent ? { ...publicResponse, requestId: requestContext.requestId } : null;
          displayResponse(publicResponse);
          if (requestActuallySent) {
            state.workspace.history = [
              {
                timestamp: new Date().toISOString(),
                method: request.method,
                url: response.finalUrl,
                statusCode: response.statusCode,
                durationMillis: response.durationMillis
              },
              ...(state.workspace.history || [])
            ].slice(0, 100);
            renderHistory();
          }
          if (!isRunnerOwnedRequest) {
            syncSavedRequestContextTabs(requestContext);
          }
        }
        setStatus(skippedBeforeSend ? 'Request skipped.' : failedBeforeSend ? 'Request failed.' : 'Request completed.');
      } catch (error) {
        const message = error.message || String(error);
        if (isActiveWorkspaceContext(requestContext)) {
          clearFailedResponseDetails(message);
        }
        setStatus(`Request failed: ${message}`);
      }
    }

    async function runActiveCollection() {
      const collection = activeCollection();
      if (!collection) {
        return setStatus('Select a collection before running it.');
      }
      collectRequestFromEditor();
      let runnerStarted = false;
      let runnerId = '';
      const runnerContext = {
        collectionId: collection.id || '',
        workspaceId: state.activeWorkspaceId
      };
      clearRunnerResultState();
      try {
        await saveWorkspace(false, { scope: 'all' });
        runnerId = runtimeId();
        state.activeRunnerId = runnerId;
        runnerStarted = true;
        element('runCollectionButton').disabled = true;
        element('cancelRunnerButton').disabled = false;
        element('runnerResults').textContent = 'Starting collection run...';
        const result = await windowObject.postmeter.runner.start(runnerId, collection, activeEnvironment(), {
          stopOnFailure: element('runnerStopOnFailure').checked
        });
        if (state.activeRunnerId !== runnerId || !isActiveWorkspaceContext(runnerContext)) {
          return;
        }
        if (Array.isArray(result.cookies)) {
          state.workspace.cookies = result.cookies;
          renderCookieJarEditor();
        }
        applyRunnerScriptMutations(result, collection);
        state.lastRunnerResult = result;
        element('runnerResults').textContent = runFormatting.formatRunnerResult(result);
        element('exportRunnerJsonButton').disabled = false;
        element('exportRunnerCsvButton').disabled = false;
        setStatus(result.cancelled ? 'Collection run cancelled.' : 'Collection run completed.');
      } catch (error) {
        const message = error.message || String(error);
        const stillCurrentRun = isActiveWorkspaceContext(runnerContext)
          && (!runnerStarted || state.activeRunnerId === runnerId);
        if (!stillCurrentRun) {
          return;
        }
        clearRunnerResultState();
        element('runnerResults').textContent = message;
        setStatus('Collection run failed.');
        notifyUser('Collection Run Failed', message);
      } finally {
        if (runnerStarted && state.activeRunnerId === runnerId) {
          element('runCollectionButton').disabled = false;
          element('cancelRunnerButton').disabled = true;
          state.activeRunnerId = null;
        }
      }
    }

    async function cancelCollectionRun() {
      if (state.activeRunnerId) {
        try {
          await windowObject.postmeter.runner.cancel(state.activeRunnerId);
          setStatus('Cancelling collection run...');
        } catch (error) {
          const message = error.message || String(error);
          element('runnerResults').textContent = message;
          setStatus('Collection run cancellation failed.');
          notifyUser('Collection Run Cancellation Failed', message);
        }
      }
    }

    async function exportRunnerResult(format) {
      if (!state.lastRunnerResult) {
        return;
      }
      try {
        const result = await windowObject.postmeter.runner.export(state.lastRunnerResult, format);
        if (!result.cancelled) {
          setStatus(`Collection run exported to ${result.path}.`);
        }
      } catch (error) {
        const message = error.message || String(error);
        setStatus('Collection run export failed.');
        notifyUser('Collection Run Export Failed', message);
      }
    }

    async function startDeviceFlow() {
      const request = activeRequest();
      if (!request) {
        return setStatus('Select a request before starting device authorization.');
      }
      collectRequestFromEditor();
      if (request.auth?.type !== 'oauth2' || request.auth?.grantType !== 'deviceCode') {
        return setStatus('Select OAuth 2.0 Device Code before starting device authorization.');
      }
      const flowId = runtimeId();
      state.activeOauthFlowId = flowId;
      setOauthButtonsBusy(true);
      element('validationLabel').textContent = '';
      setStatus('Starting OAuth device authorization...');
      renderOauthProgress({
        type: 'device',
        status: 'starting',
        message: 'Starting OAuth device authorization.'
      });
      const environment = activeEnvironment();
      const requestContext = createRequestContext(request, environment);
      try {
        const startDevice = windowObject.__postmeterStartDeviceFlow || windowObject.postmeter.oauth.startDeviceFlow;
        const result = await startDevice(flowId, request.auth, environment);
        if (state.activeOauthFlowId !== flowId) {
          return;
        }
        if (result.auth && isActiveWorkspaceContext(requestContext)) {
          const targetRequest = findContextRequest(requestContext);
          if (targetRequest) {
            targetRequest.auth = result.auth;
            if (requestContext.collectionId) {
              await saveWorkspaceStateOnly();
              syncSavedRequestContextTabs(requestContext);
            }
            if (isActiveRequestContext(requestContext)) {
              const activeResultRequest = findContextRequest(requestContext) || targetRequest;
              renderAuthEditor(activeResultRequest.auth);
            }
            renderCollections();
          }
        }
        element('validationLabel').textContent = '';
        setStatus(result.cancelled ? 'OAuth device authorization cancelled.' : 'OAuth device authorization completed.');
      } catch (error) {
        if (state.activeOauthFlowId !== flowId) {
          return;
        }
        const message = error.message || String(error);
        setStatus('OAuth device authorization failed.');
        element('validationLabel').textContent = message;
        renderOauthProgress({
          type: 'device',
          status: 'failed',
          message
        });
        notifyUser('OAuth Device Authorization Failed', message);
      } finally {
        if (state.activeOauthFlowId === flowId) {
          setOauthButtonsBusy(false);
          state.activeOauthFlowId = null;
        }
      }
    }

    async function startPkceFlow() {
      const request = activeRequest();
      if (!request) {
        return setStatus('Select a request before starting authorization.');
      }
      collectRequestFromEditor();
      if (request.auth?.type !== 'oauth2' || request.auth?.grantType !== 'authorizationCode') {
        return setStatus('Select OAuth 2.0 Authorization Code before starting authorization.');
      }
      const flowId = runtimeId();
      state.activeOauthFlowId = flowId;
      setOauthButtonsBusy(true);
      element('validationLabel').textContent = '';
      setStatus('Starting OAuth authorization...');
      renderOauthProgress({
        type: 'pkce',
        status: 'starting',
        message: 'Starting OAuth authorization-code flow.'
      });
      const environment = activeEnvironment();
      const requestContext = createRequestContext(request, environment);
      try {
        const startPkce = windowObject.__postmeterStartPkceFlow || windowObject.postmeter.oauth.startPkceFlow;
        const result = await startPkce(
          flowId,
          request.auth,
          environment,
          element('authOauthRedirectStrategySelect').value
        );
        if (state.activeOauthFlowId !== flowId) {
          return;
        }
        if (result.auth && isActiveWorkspaceContext(requestContext)) {
          const targetRequest = findContextRequest(requestContext);
          if (targetRequest) {
            targetRequest.auth = result.auth;
            if (requestContext.collectionId) {
              await saveWorkspaceStateOnly();
              syncSavedRequestContextTabs(requestContext);
            }
            if (isActiveRequestContext(requestContext)) {
              const activeResultRequest = findContextRequest(requestContext) || targetRequest;
              renderAuthEditor(activeResultRequest.auth);
            }
            renderCollections();
          }
        }
        element('validationLabel').textContent = '';
        setStatus(result.cancelled ? 'OAuth authorization cancelled.' : 'OAuth authorization completed.');
      } catch (error) {
        if (state.activeOauthFlowId !== flowId) {
          return;
        }
        const message = error.message || String(error);
        setStatus('OAuth authorization failed.');
        element('validationLabel').textContent = message;
        renderOauthProgress({
          type: 'pkce',
          status: 'failed',
          message
        });
        notifyUser('OAuth Authorization Failed', message);
      } finally {
        if (state.activeOauthFlowId === flowId) {
          setOauthButtonsBusy(false);
          state.activeOauthFlowId = null;
        }
      }
    }

    async function cancelOauthFlow() {
      if (state.activeOauthFlowId) {
        try {
          await windowObject.postmeter.oauth.cancelFlow(state.activeOauthFlowId);
          setStatus('Cancelling OAuth flow...');
        } catch (error) {
          const message = error.message || String(error);
          setStatus('OAuth cancellation failed.');
          element('validationLabel').textContent = message;
          notifyUser('OAuth Cancellation Failed', message);
        }
      }
    }

    function setOauthButtonsBusy(isBusy) {
      element('startPkceFlowButton').disabled = isBusy;
      element('startDeviceFlowButton').disabled = isBusy;
      element('cancelOauthFlowButton').disabled = !isBusy;
    }

    function renderOauthProgress(progress) {
      element('oauthProgressPanel').hidden = false;
      element('oauthProgressStatus').textContent = runFormatting.oauthStatusText(progress);
      element('oauthProgressDetail').textContent = runFormatting.oauthProgressDetail(progress);
    }

    async function saveWorkspace(showStatus = true, config = {}) {
      if (config.collectActiveEditorState !== false) {
        collectActiveEditorState();
      }
      if (
        config.promptForDraft === true
        && state.activeMainPanel === 'request'
        && !state.activeCollectionId
        && !state.activeRunnerRequestRunnerId
        && state.activeRequestId
      ) {
        const request = activeRequest();
        if (request) {
          return Boolean(await saveDraftRequestWithPrompt(request, { showStatus }));
        }
      }
      return persistWorkspace(showStatus, config);
    }

    async function persistWorkspace(showStatus = true, config = {}) {
      const requestTargetKey = resolveRequestSaveTarget(config);
      const collectionTargetKey = resolveCollectionSaveTarget(config);
      const environmentTargetKey = resolveEnvironmentSaveTarget(config);
      const settingsOnly = config.scope === 'settings'
        || (state?.activeMainPanel === 'workspace' && config.scope !== 'all' && !requestTargetKey && !collectionTargetKey && !environmentTargetKey);
      if (config.collectEditors !== false) {
        collectSettingsFromEditor();
        if (!settingsOnly) {
          collectCollectionFromEditor();
          collectRequestFromEditor();
          collectEnvironmentFromEditor();
        }
      }
      if (config.scope === 'all' || config.scope === 'runners' || (!settingsOnly && !requestTargetKey && !collectionTargetKey && !environmentTargetKey)) {
        const save = windowObject.__postmeterSaveWorkspace || windowObject.postmeter.workspace.save;
        state.workspace = await save(state.workspace);
        options.clearSavedRequestDirtyState?.();
      } else if (settingsOnly) {
        await persistWorkspaceSettings();
      } else if (requestTargetKey) {
        const requestTab = requestTabForKey(requestTargetKey);
        if (requestTab?.draft && config.allowDraftBypass === true) {
          return true;
        }
        if (!requestTab || requestTab.draft) {
          throw new Error('The selected request tab could not be saved.');
        }
        await persistRequestTab(requestTab);
      } else if (collectionTargetKey) {
        const collectionTab = collectionTabForKey(collectionTargetKey);
        if (!collectionTab) {
          throw new Error('The selected collection tab could not be saved.');
        }
        await persistCollectionTab(collectionTab);
      } else {
        const environmentTab = environmentTabForKey(environmentTargetKey);
        if (!environmentTab) {
          throw new Error('The selected environment tab could not be saved.');
        }
        await persistEnvironmentTab(environmentTab);
      }
      if (showStatus) {
        setStatus('Workspace saved.');
      }
      return true;
    }

    async function importWorkspace(filePath = undefined) {
      collectActiveEditorState();
      const importWorkspaceBoundary = windowObject.__postmeterImportWorkspace || windowObject.postmeter.workspace.importWorkspace;
      let result = null;
      try {
        result = filePath == null
          ? await importWorkspaceBoundary()
          : await importWorkspaceBoundary(filePath);
      } catch (error) {
        const message = error.message || String(error);
        setStatus(`Workspace import failed: ${message}`);
        notifyUser('Workspace Import Failed', message);
        return;
      }
      if (result.cancelled) {
        return;
      }
      if (applyWorkspaceCatalogUpdate && result.workspace && Array.isArray(result.workspaces) && result.activeWorkspaceId === state.activeWorkspaceId) {
        applyWorkspaceCatalogUpdate(result, {
          focus: 'workspace',
          selectedWorkspaceId: result.createdWorkspaceId || null
        });
      } else if (applyLoadedWorkspace && result.workspace && Array.isArray(result.workspaces)) {
        applyLoadedWorkspace(result, {
          focus: 'workspace',
          selectedWorkspaceId: result.createdWorkspaceId || null
        });
      } else {
        state.workspace = result.workspace;
        selectInitialWorkspaceItem();
        renderAll();
      }
      setStatus('Workspace imported.');
    }

    async function exportWorkspace() {
      try {
        await saveWorkspace(false, { scope: 'all' });
        const exportWorkspaceBoundary = windowObject.__postmeterExportWorkspace || windowObject.postmeter.workspace.exportWorkspace;
        const result = await exportWorkspaceBoundary(state.workspace);
        if (!result.cancelled) {
          setStatus(`Workspace exported to ${result.path}.`);
        }
      } catch (error) {
        const message = error.message || String(error);
        setStatus(`Workspace export failed: ${message}`);
        notifyUser('Workspace Export Failed', message);
      }
    }

    async function checkForUpdates() {
      setStatus('Checking for updates...');
      try {
        collectSettingsFromEditor();
        const updateCheck = windowObject.__postmeterUpdateCheck || windowObject.postmeter.app.checkForUpdates;
        const result = await updateCheck({
          includePrereleases: state.workspace.settings?.updates?.includePrereleases === true
        });
        if (!result.updateAvailable) {
          const message = `PostMeter is up to date (${result.currentVersion}${result.includePrereleases ? ', prereleases included' : ''}).`;
          setStatus(message);
          notifyUser('No Updates Available', message);
          return;
        }
        setStatus(`PostMeter ${result.latestVersion} is available.`);
        if (result.releaseUrl && await confirmAction(`PostMeter ${result.latestVersion} is available. Open GitHub Releases?`)) {
          const openExternal = windowObject.__postmeterOpenExternal || windowObject.postmeter.app.openExternal;
          await openExternal(result.releaseUrl);
        }
      } catch (error) {
        const message = error.message || String(error);
        setStatus(`Update check failed: ${message}`);
        notifyUser('Update Check Failed', message);
      }
    }

    async function importCollection(filePath = undefined) {
      collectActiveEditorState();
      const importCollectionBoundary = windowObject.__postmeterImportCollection || windowObject.postmeter.collection.importCollection;
      let result = null;
      try {
        result = filePath == null
          ? await importCollectionBoundary()
          : await importCollectionBoundary(filePath);
      } catch (error) {
        const message = error.message || String(error);
        setStatus(`Collection import failed: ${message}`);
        notifyUser('Collection Import Failed', message);
        return;
      }
      if (result.cancelled) {
        return;
      }
      const previousWorkspace = cloneJson(state.workspace, state.workspace);
      const previousActiveCollectionId = state.activeCollectionId;
      const previousActiveFolderId = state.activeFolderId;
      const previousActiveRequestId = state.activeRequestId;
      result.collection.name = uniqueName(result.collection.name, state.workspace.collections.map((collection) => collection.name));
      promoteCookieHeadersToJar(result.collection);
      state.workspace.collections.push(result.collection);
      state.activeCollectionId = result.collection.id;
      selectFirstRequest(result.collection);
      renderAll();
      try {
        await saveWorkspace(true, { scope: 'all', collectEditors: false });
      } catch (error) {
        const message = error.message || String(error);
        state.workspace = previousWorkspace;
        state.activeCollectionId = previousActiveCollectionId;
        state.activeFolderId = previousActiveFolderId;
        state.activeRequestId = previousActiveRequestId;
        renderAll();
        setStatus(`Collection import save failed: ${message}`);
        notifyUser('Collection Import Save Failed', message);
      }
    }

    async function exportCollection(collection = null, format = 'postmeter') {
      let selectedCollection = collection;
      if (!selectedCollection) {
        const collections = Array.isArray(state.workspace?.collections) ? state.workspace.collections : [];
        if (promptForCollectionExport) {
          const preferredCollection = activeCollection() || collections[0] || null;
          selectedCollection = await promptForCollectionExport(collections, preferredCollection);
          if (!selectedCollection) {
            return;
          }
        } else {
          if (!collections.length) {
            return setStatus('Create a collection before exporting.');
          }
          const preferredCollection = activeCollection() || collections[0];
          if (typeof options.prompt !== 'function') {
            selectedCollection = preferredCollection;
          } else {
          const promptMessage = [
            'Choose a collection to export:',
            ...collections.map((candidate, index) => `${index + 1}. ${candidate.name}`),
            '',
            'Enter a number or collection name.'
          ].join('\n');
          const selection = String(await promptInput(promptMessage, preferredCollection?.name || collections[0].name || '') || '').trim();
          if (!selection) {
            return;
          }
          const numericIndex = Number.parseInt(selection, 10);
          if (String(numericIndex) === selection && numericIndex >= 1 && numericIndex <= collections.length) {
            selectedCollection = collections[numericIndex - 1];
          } else {
            selectedCollection = collections.find((candidate) => candidate.name === selection)
              || collections.find((candidate) => candidate.name.toLowerCase() === selection.toLowerCase())
              || null;
            }
          }
        }
      }
      if (!selectedCollection) {
        return setStatus('Select a valid collection to export.');
      }
      const exportCollectionBoundary = windowObject.__postmeterExportCollection || windowObject.postmeter.collection.exportCollection;
      try {
        const result = await exportCollectionBoundary(selectedCollection, format);
        if (!result.cancelled) {
          setStatus(`Collection exported to ${result.path}.`);
        }
      } catch (error) {
        const message = error.message || String(error);
        setStatus(`Collection export failed: ${message}`);
        notifyUser('Collection Export Failed', message);
      }
    }

    function promoteCookieHeadersToJar(collection) {
      state.workspace.cookies ||= [];
      walkCollectionRequests(collection, (request) => {
        const host = domainFromRequestUrl(request.url);
        if (!host) {
          return;
        }
        const metadataByName = postmanCookieMetadataByName(request.variables);
        const headers = request.headers || [];
        const retainedHeaders = [];
        for (const header of headers) {
          if (header.enabled !== false && String(header.key || '').toLowerCase() === 'cookie') {
            for (const cookie of parseCookieHeaderForJar(header.value || '', host)) {
              upsertWorkspaceCookie(applyPostmanCookieMetadata(cookie, metadataByName.get(cookie.name.toLowerCase())));
            }
            request.cookieJar = { enabled: true, storeResponses: true };
          } else {
            retainedHeaders.push(header);
          }
        }
        request.headers = retainedHeaders;
      });
    }

    function upsertWorkspaceCookie(cookie) {
      const index = (state.workspace.cookies || []).findIndex((existing) =>
        existing.name.toLowerCase() === cookie.name.toLowerCase()
        && existing.domain.toLowerCase() === cookie.domain.toLowerCase()
        && (existing.path || '/') === (cookie.path || '/')
      );
      if (index >= 0) {
        state.workspace.cookies[index] = { ...state.workspace.cookies[index], ...cookie, id: state.workspace.cookies[index].id };
      } else {
        state.workspace.cookies.push(cookie);
      }
    }

    function applySingleRequestScriptMutations(result, requestContext) {
      applyEnvironmentScriptMutations(result.environment, requestContext);
      const collection = requestContext?.collectionId ? findWorkspaceCollection(requestContext.collectionId) : null;
      if (collection && Array.isArray(result.collectionVariables)) {
        collection.variables = cloneVariablePairs(result.collectionVariables);
      }
      const request = findContextRequest(requestContext);
      if (request && Array.isArray(result.localVariables)) {
        request.variables = cloneVariablePairs(result.localVariables);
      }
      renderScriptMutationEditors();
    }

    function applyRunnerScriptMutations(result, collection) {
      applyEnvironmentScriptMutations(result.environment);
      if (!collection) {
        renderScriptMutationEditors();
        return;
      }
      if (Array.isArray(result.collectionVariables)) {
        collection.variables = cloneVariablePairs(result.collectionVariables);
      }
      const variablesByRequestId = new Map();
      for (const item of result.results || []) {
        if (item.requestId && Array.isArray(item.localVariables)) {
          variablesByRequestId.set(item.requestId, cloneVariablePairs(item.localVariables));
        }
      }
      walkCollectionRequests(collection, (request) => {
        if (variablesByRequestId.has(request.id)) {
          request.variables = variablesByRequestId.get(request.id);
        }
      });
      renderScriptMutationEditors();
    }

    function applyEnvironmentScriptMutations(environment, requestContext = null) {
      if (requestContext && !isActiveWorkspaceContext(requestContext)) {
        return;
      }
      const workspaceEnvironment = findWorkspaceEnvironment(environment?.id);
      if (workspaceEnvironment && Array.isArray(environment.variables)) {
        workspaceEnvironment.variables = cloneVariablePairs(environment.variables);
      }
    }

    function renderScriptMutationEditors() {
      renderEnvironmentEditor();
      renderCollectionVariablesEditor();
      const request = activeRequest();
      if (request) {
        renderRequestVariablePairs(request.variables || []);
      }
      renderVariablePreview();
    }

    function cloneVariablePairs(pairs) {
      return Array.isArray(pairs) ? pairs.map((pair) => ({ ...pair })) : [];
    }

    return {
      applyEnvironmentScriptMutations,
      applyRunnerScriptMutations,
      applySingleRequestScriptMutations,
      cancelCollectionRun,
      cancelOauthFlow,
      checkForUpdates,
      cloneVariablePairs,
      exportCollection,
      exportRunnerResult,
      exportWorkspace,
      importCollection,
      importWorkspace,
      persistWorkspace,
      promoteCookieHeadersToJar,
      renderOauthProgress,
      renderScriptMutationEditors,
      runActiveCollection,
      saveWorkspace,
      sendActiveRequest,
      setOauthButtonsBusy,
      startDeviceFlow,
      startPkceFlow,
      upsertWorkspaceCookie
    };
  }

  const exported = {
    createRendererWorkflows
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterRendererWorkflows = exported;
})(typeof window === 'undefined' ? globalThis : window);
