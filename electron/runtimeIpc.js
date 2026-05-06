const { collectionRunResultToCsv, runCollection, runRunner } = require('../src/core/collectionRunner');
const { writeTextFileAtomic } = require('../src/core/workspacePersistence');
const { selectedSaveFilePath } = require('./fileDialogs');
const {
  applyCollectionRunMutationsToWorkspace,
  mergeCookieJarByDelta,
  mergeVariableScopeByDelta
} = require('./workspaceMutations');
const {
  assertCollectionPayload,
  assertCollectionRunResultPayload,
  assertExportFormat,
  assertOptionalEnvironmentPayload,
  assertRuntimeId,
  assertRunnerConfigPayload,
  assertRunnerPayload,
  assertRunnerProgressPayload
} = require('../src/core/ipcValidation');

function registerRuntimeIpc(options = {}) {
  const {
    dialog,
    fileOperationResult,
    getMainWindow = () => undefined,
    getWorkspace,
    getWorkspaceId = () => '',
    getVaultStore = () => null,
    getVaultPrompt = () => null,
    ipcMain,
    runCollection: runCollectionImpl = runCollection,
    runRunner: runRunnerImpl = runRunner,
    recordDiagnosticEvent = async () => {},
    mutateWorkspace = async (mutator) => {
      const nextWorkspace = await mutator(cloneJson(getWorkspace()));
      const savedWorkspace = await saveWorkspace(nextWorkspace);
      setWorkspace(savedWorkspace);
      return savedWorkspace;
    },
    saveWorkspace,
    setWorkspace
  } = options;
  const activeCollectionRuns = new Map();

  ipcMain.handle('runner:start', async (event, id, collection, environment, config = {}) => {
    assertRuntimeId(id);
    const firstClassRunner = looksLikeRunnerPayload(collection);
    if (firstClassRunner) {
      assertRunnerPayload(collection);
    } else {
      assertCollectionPayload(collection);
    }
    assertOptionalEnvironmentPayload(environment);
    assertRunnerConfigPayload(config);
    if (activeCollectionRuns.has(id)) {
      throw new Error(`Collection run is already running for id "${id}".`);
    }
    const abortController = new AbortController();
    const workspaceId = getWorkspaceId();
    const progressDelivery = createProgressDelivery({
      abortController,
      assertPayload: assertRunnerProgressPayload,
      channel: 'runner:progress',
      event,
      id,
      label: 'Collection-run progress'
    });
    activeCollectionRuns.set(id, abortController);
    try {
      const workspace = getWorkspace();
      const baseEnvironment = cloneJson(environment);
      const baseCollectionVariables = cloneJson(collection?.variables || []);
      const baseGlobals = cloneJson(workspace.globals || []);
      const baseCookies = cloneJson(workspace.cookies || []);
      const baseLocalVariablesByRequestId = requestLocalVariablesById(collection);
      const runnerOptions = {
        abortController,
        signal: abortController.signal,
        cookieJar: workspace.cookies || [],
        globals: workspace.globals || [],
        fileBindings: workspace.settings?.sandbox?.fileBindings || [],
        sandboxPackages: workspace.settings?.sandbox?.packageCache || [],
        trustedCapabilities: workspace.settings?.sandbox?.trustedCapabilities || {},
        vault: getVaultStore(workspaceId),
        vaultPrompt: getVaultPrompt(workspaceId),
        workspaceId,
        workspaceName: workspaceId,
        stopOnFailure: config.stopOnFailure ?? collection?.stopOnFailure,
        allowEnvironmentMutation: config.allowEnvironmentMutation ?? collection?.allowEnvironmentMutation,
        onProgress: progressDelivery.send,
        recordDiagnosticEvent
      };
      const result = firstClassRunner
        ? await runRunnerImpl(collection, environment, runnerOptions)
        : await runCollectionImpl(collection, environment, runnerOptions);
      progressDelivery.throwIfFailed();
      const publicResult = publicCollectionRunResult(result);
      assertCollectionRunResultPayload(publicResult);
      await recordDiagnosticEvent({
        type: 'runner.start.completed',
        level: 'info',
        outcome: 'completed',
        fields: {
          cancelled: publicResult.cancelled === true,
          failedRequests: publicResult.failedRequests || 0,
          passedRequests: publicResult.passedRequests || 0,
          requestCount: publicResult.totalRequests || 0,
          runnerOwned: firstClassRunner
        }
      });
      if (firstClassRunner) {
        await mutateWorkspace(async (latestWorkspace) => {
          if (Array.isArray(result.cookies)) {
            latestWorkspace.cookies = mergeCookieJarByDelta(latestWorkspace.cookies || [], baseCookies, result.cookies);
          }
          if (result.environmentMutationAllowed === true) {
            applyRunnerEnvironmentMutationToWorkspace(latestWorkspace, result.mutatedEnvironment || result.environment, baseEnvironment);
          }
          return latestWorkspace;
        }, { workspaceId });
      } else if (Array.isArray(result.cookies)) {
        await mutateWorkspace(async (latestWorkspace) => {
          latestWorkspace.cookies = mergeCookieJarByDelta(latestWorkspace.cookies || [], baseCookies, result.cookies);
          applyCollectionRunMutationsToWorkspace(latestWorkspace, result, {
            baseEnvironment,
            baseCollectionVariables,
            baseGlobals,
            baseLocalVariablesByRequestId
          });
          return latestWorkspace;
        }, { workspaceId });
      } else {
        await mutateWorkspace(async (latestWorkspace) => {
          applyCollectionRunMutationsToWorkspace(latestWorkspace, result, {
            baseEnvironment,
            baseCollectionVariables,
            baseGlobals,
            baseLocalVariablesByRequestId
          });
          return latestWorkspace;
        }, { workspaceId });
      }
      return publicResult;
    } catch (error) {
      await recordDiagnosticEvent({
        type: 'runner.start.failed',
        level: 'error',
        outcome: 'failed',
        failureCode: failureCodeFromError(error, 'runner_start_failed'),
        fields: {
          requestCount: firstClassRunner ? countRunnerRequests(collection) : countCollectionRequests(collection),
          runnerOwned: firstClassRunner,
          error: error?.message || String(error)
        }
      });
      throw error;
    } finally {
      if (activeCollectionRuns.get(id) === abortController) {
        activeCollectionRuns.delete(id);
      }
    }
  });

  ipcMain.handle('runner:cancel', (_event, id) => {
    assertRuntimeId(id);
    const abortController = activeCollectionRuns.get(id);
    if (!abortController) {
      return false;
    }
    abortController.abort();
    return true;
  });

  ipcMain.handle('runner:export', async (_event, result, format) => {
    const publicResult = publicCollectionRunResult(result);
    assertCollectionRunResultPayload(publicResult);
    assertExportFormat(format);
    const extension = format === 'csv' ? 'csv' : 'json';
    const saveResult = await dialog.showSaveDialog(getMainWindow(), {
      title: `Export Collection Run ${extension.toUpperCase()}`,
      defaultPath: `postmeter-collection-run.${extension}`,
      filters: [
        { name: extension.toUpperCase(), extensions: [extension] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    const filePath = selectedSaveFilePath(saveResult);
    if (!filePath) {
      return fileOperationResult({ cancelled: true });
    }
    const content = format === 'csv' ? collectionRunResultToCsv(publicResult) : JSON.stringify(publicResult, null, 2);
    await writeTextFileAtomic(filePath, content, { prefix: 'postmeter-runner-export' });
    return fileOperationResult({ cancelled: false, path: filePath });
  });

}

function requestLocalVariablesById(collection) {
  const byId = new Map();
  const visit = (requests = [], folders = []) => {
    for (const request of requests || []) {
      if (request?.id) {
        byId.set(request.id, cloneJson(request.variables || []));
      }
    }
    for (const folder of folders || []) {
      visit(folder.requests || [], folder.folders || []);
    }
  };
  visit(collection?.requests || [], collection?.folders || []);
  return byId;
}

function looksLikeRunnerPayload(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && (
      Object.hasOwn(value, 'environmentId')
      || Object.hasOwn(value, 'allowEnvironmentMutation')
      || Object.hasOwn(value, 'stopOnFailure')
    )
  );
}

function cloneJson(value) {
  if (value == null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function createProgressDelivery({ abortController, assertPayload, channel, event, id, label }) {
  let deliveryError = null;
  return {
    send(progress) {
      if (deliveryError) {
        return;
      }
      try {
        assertPayload(progress);
        if (event.sender?.isDestroyed?.() === true) {
          throw new Error('renderer sender is destroyed');
        }
        event.sender.send(channel, { id, progress });
      } catch (error) {
        const message = error.message || String(error);
        deliveryError = new Error(`${label} delivery failed: ${message}`);
        abortController.abort();
      }
    },
    throwIfFailed() {
      if (deliveryError) {
        throw deliveryError;
      }
    }
  };
}

function publicCollectionRunResult(result) {
  const publicResult = cloneJson(result) || {};
  if (Array.isArray(publicResult.results)) {
    for (const item of publicResult.results) {
      delete item.updatedAuth;
    }
  }
  delete publicResult.authUpdates;
  return publicResult;
}

function applyRunnerEnvironmentMutationToWorkspace(workspace, environment, baseEnvironment) {
  if (!environment?.id || environment.id === 'runtime' || environment.id === 'none' || !Array.isArray(environment.variables)) {
    return;
  }
  const workspaceEnvironment = (workspace.environments || []).find((candidate) => candidate.id === environment.id);
  if (!workspaceEnvironment) {
    return;
  }
  workspaceEnvironment.variables = baseEnvironment?.id === environment.id
    ? mergeVariableScopeByDelta(workspaceEnvironment.variables, baseEnvironment.variables, environment.variables)
    : cloneJson(environment.variables);
}

function countCollectionRequests(collection = {}) {
  let count = Array.isArray(collection.requests) ? collection.requests.length : 0;
  for (const folder of collection.folders || []) {
    count += countCollectionRequests(folder);
  }
  return count;
}

function countRunnerRequests(runner = {}) {
  return Array.isArray(runner.requests) ? runner.requests.length : 0;
}

function failureCodeFromError(error, fallback) {
  const text = String(error?.message || fallback || 'error').toLowerCase();
  if (/progress.*delivery/.test(text)) {
    return 'progress_delivery_failed';
  }
  if (/cancel/.test(text)) {
    return 'operation_cancelled';
  }
  if (/timeout|timed out/.test(text)) {
    return 'operation_timeout';
  }
  if (/sendrequest|send request|pm\.sendrequest/.test(text)) {
    return 'script_send_request_denied_or_failed';
  }
  if (/pm\.vault|vault/.test(text)) {
    return 'script_vault_denied_or_failed';
  }
  if (/pm\.cookies|cookie/.test(text)) {
    return 'script_cookie_denied_or_failed';
  }
  return String(fallback || 'runtime_failed');
}

module.exports = {
  registerRuntimeIpc
};
