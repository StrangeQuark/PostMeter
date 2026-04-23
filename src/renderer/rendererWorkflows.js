(function attachRendererWorkflows(global) {
  function createRendererWorkflows(options = {}) {
    const state = options.state;
    const doc = options.doc || document;
    const windowObject = options.windowObject || window;
    const runFormatting = options.runFormatting || global.PostMeterRunFormatting || require('./runResultFormatting');
    const activeCollection = options.activeCollection || (() => null);
    const activeEnvironment = options.activeEnvironment || (() => null);
    const activeRequest = options.activeRequest || (() => null);
    const applyPostmanCookieMetadata = options.applyPostmanCookieMetadata || ((cookie) => cookie);
    const collectEnvironmentFromEditor = options.collectEnvironmentFromEditor || (() => {});
    const collectRequestFromEditor = options.collectRequestFromEditor || (() => {});
    const collectSettingsFromEditor = options.collectSettingsFromEditor || (() => {});
    const displayResponse = options.displayResponse || (() => {});
    const domainFromRequestUrl = options.domainFromRequestUrl || (() => '');
    const loadConfigFromControls = options.loadConfigFromControls || (() => ({}));
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
    const saveDraftRequestWithPrompt = options.saveDraftRequestWithPrompt || (async () => null);
    const selectFirstRequest = options.selectFirstRequest || (() => {});
    const selectInitialWorkspaceItem = options.selectInitialWorkspaceItem || (() => {});
    const setStatus = options.setStatus || (() => {});
    const uniqueName = options.uniqueName || ((baseName) => baseName);
    const walkCollectionRequests = options.walkCollectionRequests || (() => {});

    function element(id) {
      return doc.getElementById(id);
    }

    function confirmAction(message) {
      if (typeof options.confirm === 'function') {
        return options.confirm(message);
      }
      if (typeof windowObject.confirm === 'function') {
        return windowObject.confirm(message);
      }
      if (typeof globalThis.confirm === 'function') {
        return globalThis.confirm(message);
      }
      return true;
    }

    async function sendActiveRequest() {
      const request = activeRequest();
      if (!request) {
        return setStatus('Select a request before sending.');
      }
      collectRequestFromEditor();
      await saveWorkspace(false);
      const environment = activeEnvironment();
      if (!request.scripts?.preRequest?.trim()) {
        const errors = await windowObject.postmeter.request.validate(request, environment);
        if (errors.length) {
          element('validationLabel').textContent = errors.join(' ');
          return setStatus('Fix validation errors.');
        }
      }
      element('validationLabel').textContent = '';
      setStatus('Sending request...');
      try {
        const response = await windowObject.postmeter.request.send(request, environment);
        if (response.updatedAuth) {
          request.auth = response.updatedAuth;
          renderAuthEditor(request.auth);
        }
        if (Array.isArray(response.updatedCookies)) {
          state.workspace.cookies = response.updatedCookies;
          renderCookieJarEditor();
        }
        applySingleRequestScriptMutations(response, request);
        state.lastResponse = response;
        element('captureResponseExampleButton').disabled = false;
        displayResponse(response);
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
        setStatus('Request completed.');
      } catch (error) {
        element('responseStatus').textContent = 'ERR';
        const message = error.message || String(error);
        element('responseBody').value = message;
        setStatus('Request failed.');
        notifyUser('Request Failed', message);
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
      const errors = await windowObject.postmeter.request.validate(request, environment);
      if (errors.length) {
        element('validationLabel').textContent = errors.join(' ');
        return setStatus('Fix validation errors.');
      }
      const concurrency = Number(element('loadConcurrency').value);
      let confirmedHighConcurrency = false;
      if (concurrency >= 50) {
        confirmedHighConcurrency = confirmAction(`Run load test with concurrency ${concurrency}?`);
        if (!confirmedHighConcurrency) {
          return setStatus('Load test cancelled.');
        }
      }
      state.activeLoadId = crypto.randomUUID();
      element('runLoadButton').disabled = true;
      element('cancelLoadButton').disabled = false;
      element('exportLoadJsonButton').disabled = true;
      element('exportLoadCsvButton').disabled = true;
      element('loadResults').textContent = 'Starting load test...';
      try {
        state.lastLoadResult = await windowObject.postmeter.loadTest.start(state.activeLoadId, request, environment, {
          ...loadConfigFromControls(),
          concurrency,
          confirmedHighConcurrency
        });
        element('loadResults').textContent = runFormatting.formatLoadResult(state.lastLoadResult);
        element('exportLoadJsonButton').disabled = false;
        element('exportLoadCsvButton').disabled = false;
        setStatus(state.lastLoadResult.cancelled ? 'Load test cancelled.' : 'Load test completed.');
      } catch (error) {
        const message = error.message || String(error);
        element('loadResults').textContent = message;
        setStatus('Load test failed.');
        notifyUser('Load Test Failed', message);
      } finally {
        element('runLoadButton').disabled = false;
        element('cancelLoadButton').disabled = true;
        state.activeLoadId = null;
      }
    }

    async function cancelLoadTest() {
      if (state.activeLoadId) {
        await windowObject.postmeter.loadTest.cancel(state.activeLoadId);
        setStatus('Cancelling load test...');
      }
    }

    async function runActiveCollection() {
      const collection = activeCollection();
      if (!collection) {
        return setStatus('Select a collection before running it.');
      }
      collectRequestFromEditor();
      await saveWorkspace(false);
      state.activeRunnerId = crypto.randomUUID();
      state.lastRunnerResult = null;
      element('runCollectionButton').disabled = true;
      element('cancelRunnerButton').disabled = false;
      element('exportRunnerJsonButton').disabled = true;
      element('exportRunnerCsvButton').disabled = true;
      element('runnerResults').textContent = 'Starting collection run...';
      try {
        const result = await windowObject.postmeter.runner.start(state.activeRunnerId, collection, activeEnvironment(), {
          stopOnFailure: element('runnerStopOnFailure').checked
        });
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
        element('runnerResults').textContent = message;
        setStatus('Collection run failed.');
        notifyUser('Collection Run Failed', message);
      } finally {
        element('runCollectionButton').disabled = false;
        element('cancelRunnerButton').disabled = true;
        state.activeRunnerId = null;
      }
    }

    async function cancelCollectionRun() {
      if (state.activeRunnerId) {
        await windowObject.postmeter.runner.cancel(state.activeRunnerId);
        setStatus('Cancelling collection run...');
      }
    }

    async function exportRunnerResult(format) {
      if (!state.lastRunnerResult) {
        return;
      }
      const result = await windowObject.postmeter.runner.export(state.lastRunnerResult, format);
      if (!result.cancelled) {
        setStatus(`Collection run exported to ${result.path}.`);
      }
    }

    async function exportLoadResult(format) {
      if (!state.lastLoadResult) {
        return;
      }
      const result = await windowObject.postmeter.loadTest.export(state.lastLoadResult, format);
      if (!result.cancelled) {
        setStatus(`Load test exported to ${result.path}.`);
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
      state.activeOauthFlowId = crypto.randomUUID();
      setOauthButtonsBusy(true);
      setStatus('Starting OAuth device authorization...');
      renderOauthProgress({
        type: 'device',
        status: 'starting',
        message: 'Starting OAuth device authorization.'
      });
      try {
        const startDevice = windowObject.__postmeterStartDeviceFlow || windowObject.postmeter.oauth.startDeviceFlow;
        const result = await startDevice(state.activeOauthFlowId, request.auth, activeEnvironment());
        if (result.auth) {
          request.auth = result.auth;
          renderAuthEditor(request.auth);
          renderCollections();
          await saveWorkspace(false);
        }
        setStatus(result.cancelled ? 'OAuth device authorization cancelled.' : 'OAuth device authorization completed.');
      } catch (error) {
        const message = error.message || String(error);
        setStatus('OAuth device authorization failed.');
        element('validationLabel').textContent = message;
        notifyUser('OAuth Device Authorization Failed', message);
      } finally {
        setOauthButtonsBusy(false);
        state.activeOauthFlowId = null;
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
      state.activeOauthFlowId = crypto.randomUUID();
      setOauthButtonsBusy(true);
      setStatus('Starting OAuth authorization...');
      renderOauthProgress({
        type: 'pkce',
        status: 'starting',
        message: 'Starting OAuth authorization-code flow.'
      });
      try {
        const startPkce = windowObject.__postmeterStartPkceFlow || windowObject.postmeter.oauth.startPkceFlow;
        const result = await startPkce(
          state.activeOauthFlowId,
          request.auth,
          activeEnvironment(),
          element('authOauthRedirectStrategySelect').value
        );
        if (result.auth) {
          request.auth = result.auth;
          renderAuthEditor(request.auth);
          renderCollections();
          await saveWorkspace(false);
        }
        setStatus(result.cancelled ? 'OAuth authorization cancelled.' : 'OAuth authorization completed.');
      } catch (error) {
        const message = error.message || String(error);
        setStatus('OAuth authorization failed.');
        element('validationLabel').textContent = message;
        notifyUser('OAuth Authorization Failed', message);
      } finally {
        setOauthButtonsBusy(false);
        state.activeOauthFlowId = null;
      }
    }

    async function cancelOauthFlow() {
      if (state.activeOauthFlowId) {
        await windowObject.postmeter.oauth.cancelFlow(state.activeOauthFlowId);
        setStatus('Cancelling OAuth flow...');
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
      collectRequestFromEditor();
      if (config.promptForDraft === true && !state.activeCollectionId && state.activeRequestId) {
        const request = activeRequest();
        if (request) {
          return Boolean(await saveDraftRequestWithPrompt(request, { showStatus }));
        }
      }
      return persistWorkspace(showStatus);
    }

    async function persistWorkspace(showStatus = true, config = {}) {
      if (config.collectEditors !== false) {
        collectRequestFromEditor();
        collectEnvironmentFromEditor();
        collectSettingsFromEditor();
      }
      const save = windowObject.__postmeterSaveWorkspace || windowObject.postmeter.workspace.save;
      state.workspace = await save(state.workspace);
      options.clearSavedRequestDirtyState?.();
      if (showStatus) {
        setStatus('Workspace saved.');
      }
      return true;
    }

    async function importWorkspace() {
      if (!confirmAction('Importing a workspace replaces the current workspace. A backup will be created first. Continue?')) {
        return;
      }
      const result = await windowObject.postmeter.workspace.importWorkspace();
      if (result.cancelled) {
        return;
      }
      state.workspace = result.workspace;
      selectInitialWorkspaceItem();
      renderAll();
      setStatus(`Workspace imported. Backup: ${result.backupPath || 'none'}`);
    }

    async function exportWorkspace() {
      await saveWorkspace(false);
      const exportWorkspaceBoundary = windowObject.__postmeterExportWorkspace || windowObject.postmeter.workspace.exportWorkspace;
      const result = await exportWorkspaceBoundary(state.workspace);
      if (!result.cancelled) {
        setStatus(`Workspace exported to ${result.path}.`);
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
        if (result.releaseUrl && confirmAction(`PostMeter ${result.latestVersion} is available. Open GitHub Releases?`)) {
          const openExternal = windowObject.__postmeterOpenExternal || windowObject.postmeter.app.openExternal;
          await openExternal(result.releaseUrl);
        }
      } catch (error) {
        const message = error.message || String(error);
        setStatus(`Update check failed: ${message}`);
        notifyUser('Update Check Failed', message);
      }
    }

    async function importCollection() {
      const importCollectionBoundary = windowObject.__postmeterImportCollection || windowObject.postmeter.collection.importCollection;
      const result = await importCollectionBoundary();
      if (result.cancelled) {
        return;
      }
      result.collection.name = uniqueName(result.collection.name, state.workspace.collections.map((collection) => collection.name));
      promoteCookieHeadersToJar(result.collection);
      state.workspace.collections.push(result.collection);
      state.activeCollectionId = result.collection.id;
      selectFirstRequest(result.collection);
      renderAll();
      await saveWorkspace();
    }

    async function exportCollection(collection = activeCollection(), format = 'postmeter') {
      if (!collection) {
        return setStatus('Select a collection to export.');
      }
      const exportCollectionBoundary = windowObject.__postmeterExportCollection || windowObject.postmeter.collection.exportCollection;
      const result = await exportCollectionBoundary(collection, format);
      if (!result.cancelled) {
        setStatus(`Collection exported to ${result.path}.`);
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

    function applySingleRequestScriptMutations(result, request) {
      applyEnvironmentScriptMutations(result.environment);
      const collection = activeCollection();
      if (collection && Array.isArray(result.collectionVariables)) {
        collection.variables = cloneVariablePairs(result.collectionVariables);
      }
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

    function applyEnvironmentScriptMutations(environment) {
      const active = activeEnvironment();
      if (active && environment?.id === active.id && Array.isArray(environment.variables)) {
        active.variables = cloneVariablePairs(environment.variables);
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
      cancelLoadTest,
      cancelOauthFlow,
      checkForUpdates,
      cloneVariablePairs,
      exportCollection,
      exportLoadResult,
      exportRunnerResult,
      exportWorkspace,
      importCollection,
      importWorkspace,
      persistWorkspace,
      promoteCookieHeadersToJar,
      renderOauthProgress,
      renderScriptMutationEditors,
      runActiveCollection,
      runLoadTest,
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
