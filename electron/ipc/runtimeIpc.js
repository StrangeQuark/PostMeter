const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { collectionRunResultToCsv, runCollection, runRunner } = require('../../src/core/runtime/collectionRunner');
const { fieldLimit } = require('../../src/core/contracts/payloadSchemas');
const {
  exportPerformanceTestToJson,
  importPerformanceTestFromText,
  performanceResultToCsv
} = require('../../src/core/import-export/performanceFormats');
const { runPerformanceCalibration } = require('../../src/core/runtime/performanceCalibration');
const { runPerformanceTest } = require('../../src/core/runtime/performanceRunner');
const { writeTextFileAtomic } = require('../../src/core/workspace/workspacePersistence');
const {
  cleanupRuntimeResultStore,
  createRuntimeResultStore,
  defaultRuntimeResultStorePath,
  estimateRuntimeResultStoreSize,
  runtimeResultStoreFiles
} = require('../../src/core/runtime/runtimeResultStore');
const { normalizeCapturePolicy } = require('../../src/core/workspace/resultCapturePolicy');
const { resultHtmlReportToHtml } = require('../../src/core/import-export/resultHtmlReport');
const {
  performanceExportExtension,
  performanceExportFilters,
  performanceImportFilters,
  safeFilename,
  selectedOpenFilePath,
  selectedSaveFilePath,
  validateDialogFilePath
} = require('../app-shell/fileDialogs');
const {
  applyCollectionRunMutationsToWorkspace,
  mergeCookieJarByDelta,
  mergeVariableScopeByDelta
} = require('../services/workspaceMutations');
const {
  assertCollectionPayload,
  assertCollectionRunResultPayload,
  assertExportFormat,
  assertHtmlReportOptionsPayload,
  assertOptionalEnvironmentPayload,
  assertPerformanceCalibrationResultPayload,
  assertPerformanceExportFormat,
  assertPerformanceProgressPayload,
  assertPerformanceResultPayload,
  assertPerformanceTestPayload,
  assertRuntimeId,
  assertRunnerConfigPayload,
  assertRunnerPayload,
  assertRunnerProgressPayload
} = require('../../src/core/contracts/ipcValidation');
const { resolveTlsSettingsSecrets } = require('../../src/core/http/tlsSettings');
const {
  createRequestNetworkPolicyForWorkspace
} = require('../security/requestNetworkPolicy');
const {
  classifyHostname
} = require('../../src/core/security/networkPolicy');
const { mainOwnedFileBindingsForWorkspace } = require('../../src/core/http/fileAttachmentBindings');

const RESULT_STORE_WARNING_MARGIN_BYTES = 1024 * 1024 * 1024;
const IMPORT_TEXT_LIMIT = fieldLimit('body');
const RUN_PROGRESS_MIN_INTERVAL_MILLIS = 250;
const HIGH_RISK_RUN_THRESHOLDS = Object.freeze({
  plannedRequests: 1000,
  concurrency: 5,
  durationSeconds: 60
});

function normalizeHtmlReportOptions(options = {}) {
  assertHtmlReportOptionsPayload(options);
  const includeRequestResults = options?.includeRequestResults !== false;
  return {
    theme: options?.theme === 'dark' ? 'dark' : 'light',
    includeRequestResults,
    includeRequestDetails: includeRequestResults && options?.includeRequestDetails !== false
  };
}

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
    env = process.env,
    runCollection: runCollectionImpl = runCollection,
    runPerformanceCalibration: runPerformanceCalibrationImpl = runPerformanceCalibration,
    runPerformanceTest: runPerformanceTestImpl = runPerformanceTest,
    runRunner: runRunnerImpl = runRunner,
    resultStorePath = defaultRuntimeResultStorePath(process.env.POSTMETER_RESULT_STORE_PATH || path.join(os.tmpdir(), 'postmeter')),
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
  const activePerformanceRuns = new Map();
  const activePerformanceCalibrations = new Map();
  let currentResultStore = null;
  let activeResultStoreRunId = '';
  prepareRuntimeResultStore.path = resultStorePath;
  currentStoreAccessor.getStore = () => currentResultStore;
  const closeCurrentResultStore = () => {
    currentResultStore?.close?.();
    currentResultStore = null;
    activeResultStoreRunId = '';
  };

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
    if (activeResultStoreRunId) {
      throw new Error('Another result-producing run is already running.');
    }
    const abortController = new AbortController();
    activeResultStoreRunId = id;
    const workspaceId = getWorkspaceId();
    const progressDelivery = createProgressDelivery({
      abortController,
      assertPayload: assertRunnerProgressPayload,
      channel: 'runner:progress',
      event,
      id,
      label: 'Collection-run progress',
      minIntervalMillis: RUN_PROGRESS_MIN_INTERVAL_MILLIS
    });
    activeCollectionRuns.set(id, abortController);
    try {
      const workspace = getWorkspace();
      const plannedRequests = firstClassRunner ? countRunnerRequests(collection) : countCollectionRequests(collection);
      const highRiskRun = await confirmHighRiskRunIfNeeded({
        collection,
        concurrency: 1,
        dialog,
        durationSeconds: 0,
        getMainWindow,
        kind: 'runner',
        plannedRequests,
        recordDiagnosticEvent,
        workspace
      });
      currentResultStore?.close?.();
      currentResultStore = await prepareRuntimeResultStore({
        capturePolicy: config.capturePolicy || collection.capturePolicy,
        id,
        kind: 'runner',
        metadata: {
          name: collection?.name || '',
          runnerOwned: firstClassRunner
        },
        plannedRequests
      });
      const baseEnvironment = cloneJson(environment);
      const baseCollectionVariables = cloneJson(collection?.variables || []);
      const baseGlobals = cloneJson(workspace.globals || []);
      const baseCookies = cloneJson(workspace.cookies || []);
      const baseLocalVariablesByRequestId = requestLocalVariablesById(collection);
      const vaultStore = getVaultStore(workspaceId);
      const tlsSettings = await resolveTlsSettingsSecrets(workspace.settings || {}, vaultStore);
      const networkPolicy = createRequestNetworkPolicyForWorkspace({
        dialog,
        getMainWindow,
        recordDiagnosticEvent,
        workspace
      });
      const runnerOptions = {
        abortController,
        signal: abortController.signal,
        cookieJar: workspace.cookies || [],
        globals: workspace.globals || [],
        fileBindings: mainOwnedFileBindings(workspace),
        networkPolicy,
        sandboxPackages: workspace.settings?.sandbox?.packageCache || [],
        trustedCapabilities: scriptTrustedCapabilitiesForWorkspace(workspace),
        includeTransportDiagnostics: true,
        tlsSettings,
        vault: vaultStore,
        vaultPrompt: getVaultPrompt(workspaceId),
        workspaceId,
        workspaceName: workspaceId,
        stopOnFailure: config.stopOnFailure ?? collection?.stopOnFailure,
        allowEnvironmentMutation: config.allowEnvironmentMutation ?? collection?.allowEnvironmentMutation,
        onProgress: progressDelivery.send,
        plannedRequests,
        resultWriter: currentResultStore,
        retainResults: !firstClassRunner,
        recordDiagnosticEvent
      };
      await recordHighRiskRunStarted(highRiskRun, recordDiagnosticEvent);
      const result = firstClassRunner
        ? await runRunnerImpl(collection, environment, runnerOptions)
        : await runCollectionImpl(collection, environment, runnerOptions);
      progressDelivery.throwIfFailed();
      if (currentResultStore.count('runner') === 0 && Array.isArray(result.results)) {
        for (const [index, item] of result.results.entries()) {
          currentResultStore.recordRunnerResult(item, { index, totalRequests: plannedRequests });
        }
      }
      currentResultStore.finishRun(result);
      const publicResult = storedCollectionRunResult(publicCollectionRunResult(result), currentResultStore);
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
      currentResultStore?.failRun?.({ error: error?.message || String(error), id });
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
      progressDelivery.dispose();
      if (activeCollectionRuns.get(id) === abortController) {
        activeCollectionRuns.delete(id);
      }
      if (activeResultStoreRunId === id) {
        activeResultStoreRunId = '';
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

  ipcMain.handle('runner:export', async (_event, result, format, htmlReportOptions = {}) => {
    const publicResult = publicCollectionRunResult(result);
    assertCollectionRunResultPayload(publicResult);
    assertExportFormat(format);
    const normalizedHtmlReportOptions = format === 'html' ? normalizeHtmlReportOptions(htmlReportOptions) : {};
    const extension = resultExportExtension(format);
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
    if (publicResult.storeBacked === true) {
      assertCurrentStoreResult(publicResult, 'runner');
      if (format === 'csv') {
        await currentResultStore.exportCsv(filePath, { kind: 'runner', result: publicResult });
      } else if (format === 'html') {
        await currentResultStore.exportHtml(filePath, { kind: 'runner', result: publicResult, ...normalizedHtmlReportOptions });
      } else {
        await currentResultStore.exportJson(filePath, { kind: 'runner', result: publicResult });
      }
      return fileOperationResult(safeFileOperationExportResult(filePath));
    }
    const content = format === 'csv'
      ? collectionRunResultToCsv(publicResult)
      : format === 'html'
        ? await resultHtmlReportToHtml({ kind: 'runner', result: publicResult, ...normalizedHtmlReportOptions })
        : JSON.stringify(publicResult, null, 2);
    await writeTextFileAtomic(filePath, content, { prefix: 'postmeter-runner-export' });
    return fileOperationResult(safeFileOperationExportResult(filePath));
  });

  ipcMain.handle('runner:estimateResultStore', async (_event, collection, config = {}) => {
    const firstClassRunner = looksLikeRunnerPayload(collection);
    if (firstClassRunner) {
      assertRunnerPayload(collection);
    } else {
      assertCollectionPayload(collection);
    }
    assertRunnerConfigPayload(config);
    const plannedRequests = firstClassRunner ? countRunnerRequests(collection) : countCollectionRequests(collection);
    return runtimeResultStoreEstimate({
      averageMetadataBytes: firstClassRunner
        ? averageRunnerRequestMetadataBytes(collection)
        : averageCollectionRequestMetadataBytes(collection),
      capturePolicy: config.capturePolicy || collection.capturePolicy,
      diagnostic: false,
      kind: 'runner',
      plannedRequests
    });
  });

  ipcMain.handle('performance:start', async (event, id, performanceTest, environment) => {
    assertRuntimeId(id);
    assertPerformanceTestPayload(performanceTest);
    assertOptionalEnvironmentPayload(environment);
    if (activePerformanceRuns.has(id)) {
      throw new Error(`Performance test is already running for id "${id}".`);
    }
    if (activeResultStoreRunId) {
      throw new Error('Another result-producing run is already running.');
    }
    const abortController = new AbortController();
    activeResultStoreRunId = id;
    const workspaceId = getWorkspaceId();
    const progressDelivery = createProgressDelivery({
      abortController,
      assertPayload: assertPerformanceProgressPayload,
      channel: 'performance:progress',
      event,
      id,
      label: 'Performance-test progress',
      minIntervalMillis: RUN_PROGRESS_MIN_INTERVAL_MILLIS
    });
    activePerformanceRuns.set(id, abortController);
    try {
      const workspace = getWorkspace();
      const baseEnvironment = cloneJson(environment);
      const baseCookies = cloneJson(workspace.cookies || []);
      const plannedRequests = estimatePerformancePlannedRequests(performanceTest);
      const highRiskRun = await confirmHighRiskRunIfNeeded({
        concurrency: estimatePerformanceConcurrency(performanceTest),
        dialog,
        durationSeconds: estimatePerformanceDurationSeconds(performanceTest),
        getMainWindow,
        kind: 'performance',
        performanceTest,
        plannedRequests,
        recordDiagnosticEvent,
        workspace
      });
      const vaultStore = getVaultStore(workspaceId);
      const tlsSettings = await resolveTlsSettingsSecrets(workspace.settings || {}, vaultStore);
      const networkPolicy = createRequestNetworkPolicyForWorkspace({
        dialog,
        getMainWindow,
        recordDiagnosticEvent,
        workspace
      });
      currentResultStore?.close?.();
      currentResultStore = await prepareRuntimeResultStore({
        capturePolicy: performanceTest.capturePolicy,
        id,
        kind: 'performance',
        metadata: {
          name: performanceTest?.name || '',
          type: performanceTest?.type || ''
        },
        plannedRequests
      });
      await recordHighRiskRunStarted(highRiskRun, recordDiagnosticEvent);
      const result = await runPerformanceTestImpl(performanceTest, environment, {
        abortController,
        signal: abortController.signal,
        cookieJar: workspace.cookies || [],
        globals: workspace.globals || [],
        fileBindings: mainOwnedFileBindings(workspace),
        networkPolicy,
        sandboxPackages: workspace.settings?.sandbox?.packageCache || [],
        trustedCapabilities: scriptTrustedCapabilitiesForWorkspace(workspace),
        tlsSettings,
        vault: vaultStore,
        vaultPrompt: getVaultPrompt(workspaceId),
        workspaceId,
        workspaceName: workspaceId,
        onProgress: progressDelivery.send,
        plannedRequests,
        resultWriter: currentResultStore,
        retainSamples: false,
        recordDiagnosticEvent
      });
      progressDelivery.throwIfFailed();
      if (currentResultStore.count('performance') === 0 && Array.isArray(result.samples)) {
        for (const [index, item] of result.samples.entries()) {
          currentResultStore.recordPerformanceSample(item, { index, totalRequests: plannedRequests });
        }
      }
      currentResultStore.finishRun(result);
      const publicResult = storedPerformanceResult(publicPerformanceResult(result), currentResultStore);
      assertPerformanceResultPayload(publicResult);
      await recordDiagnosticEvent({
        type: 'performance.start.completed',
        level: 'info',
        outcome: 'completed',
        fields: {
          cancelled: publicResult.cancelled === true,
          failedRequests: publicResult.failedRequests || 0,
          requestCount: publicResult.completedRequests || 0,
          type: publicResult.type || ''
        }
      });
      await mutateWorkspace(async (latestWorkspace) => {
        if (Array.isArray(result.cookies)) {
          latestWorkspace.cookies = mergeCookieJarByDelta(latestWorkspace.cookies || [], baseCookies, result.cookies);
        }
        if (result.environmentMutationAllowed === true) {
          applyRunnerEnvironmentMutationToWorkspace(latestWorkspace, result.mutatedEnvironment || result.environment, baseEnvironment);
        }
        return latestWorkspace;
      }, { workspaceId });
      return publicResult;
    } catch (error) {
      currentResultStore?.failRun?.({ error: error?.message || String(error), id });
      await recordDiagnosticEvent({
        type: 'performance.start.failed',
        level: 'error',
        outcome: 'failed',
        failureCode: failureCodeFromError(error, 'performance_start_failed'),
        fields: {
          error: error?.message || String(error),
          type: performanceTest?.type || ''
        }
      });
      throw error;
    } finally {
      progressDelivery.dispose();
      if (activePerformanceRuns.get(id) === abortController) {
        activePerformanceRuns.delete(id);
      }
      if (activeResultStoreRunId === id) {
        activeResultStoreRunId = '';
      }
    }
  });

  ipcMain.handle('performance:cancel', (_event, id) => {
    assertRuntimeId(id);
    const abortController = activePerformanceRuns.get(id);
    if (!abortController) {
      return false;
    }
    abortController.abort();
    return true;
  });

  ipcMain.handle('performance:calibrate', async (event, id) => {
    assertRuntimeId(id);
    if (activePerformanceCalibrations.has(id)) {
      throw new Error(`Performance calibration is already running for id "${id}".`);
    }
    const abortController = new AbortController();
    const progressDelivery = createProgressDelivery({
      abortController,
      assertPayload: assertPerformanceProgressPayload,
      channel: 'performance:progress',
      event,
      id,
      label: 'Performance calibration progress'
    });
    activePerformanceCalibrations.set(id, abortController);
    try {
      const result = await runPerformanceCalibrationImpl({
        ...performanceCalibrationOptionsForRuntime(env),
        signal: abortController.signal,
        onProgress: progressDelivery.send
      });
      progressDelivery.throwIfFailed();
      assertPerformanceCalibrationResultPayload(result);
      await recordDiagnosticEvent({
        type: 'performance.calibration.completed',
        level: 'info',
        outcome: 'completed',
        fields: {
          cancelled: result.cancelled === true,
          completedRequests: result.summary?.completedRequests || 0,
          failedRequests: result.summary?.failedRequests || 0,
          peakRequestsPerSecond: result.summary?.peakRequestsPerSecond || 0
        }
      });
      return result;
    } catch (error) {
      await recordDiagnosticEvent({
        type: 'performance.calibration.failed',
        level: 'error',
        outcome: 'failed',
        failureCode: failureCodeFromError(error, 'performance_calibration_failed'),
        fields: {
          error: error?.message || String(error)
        }
      });
      throw error;
    } finally {
      progressDelivery.dispose();
      if (activePerformanceCalibrations.get(id) === abortController) {
        activePerformanceCalibrations.delete(id);
      }
    }
  });

  ipcMain.handle('performance:calibrate:cancel', (_event, id) => {
    assertRuntimeId(id);
    const abortController = activePerformanceCalibrations.get(id);
    if (!abortController) {
      return false;
    }
    abortController.abort();
    return true;
  });

  ipcMain.handle('performance:import', async (_event, providedSource = null) => {
    const importSource = await readTextImportSource(providedSource, 'performance import path', async () => selectedOpenFilePath(await dialog.showOpenDialog(getMainWindow(), {
        title: 'Import Performance Test',
        properties: ['openFile'],
        filters: performanceImportFilters()
      })), { dialog, env, getMainWindow });
    if (!importSource) {
      return fileOperationResult({ cancelled: true });
    }
    const performanceTest = importPerformanceTestFromText(importSource.text);
    assertPerformanceTestPayload(performanceTest);
    return fileOperationResult({ cancelled: false, performanceTest });
  });

  ipcMain.handle('performance:export', async (_event, performanceTest, format = 'postmeter') => {
    assertPerformanceTestPayload(performanceTest);
    assertPerformanceExportFormat(format);
    if (format === 'csv' || format === 'html') {
      throw new Error('Performance test definitions can only be exported as JSON.');
    }
    const extension = performanceExportExtension(format);
    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Export Performance Test',
      defaultPath: `${safeFilename(performanceTest?.name || 'performance-test')}.postmeter-performance.${extension}`,
      filters: performanceExportFilters(format)
    });
    const filePath = selectedSaveFilePath(result);
    if (!filePath) {
      return fileOperationResult({ cancelled: true });
    }
    await writeTextFileAtomic(filePath, exportPerformanceTestToJson(performanceTest), { prefix: 'postmeter-performance-export' });
    return fileOperationResult(safeFileOperationExportResult(filePath));
  });

  ipcMain.handle('performance:exportResult', async (_event, result, format = 'json', htmlReportOptions = {}) => {
    const publicResult = publicPerformanceResult(result);
    assertPerformanceResultPayload(publicResult);
    assertPerformanceExportFormat(format);
    const normalizedHtmlReportOptions = format === 'html' ? normalizeHtmlReportOptions(htmlReportOptions) : {};
    const extension = performanceExportExtension(format);
    const saveResult = await dialog.showSaveDialog(getMainWindow(), {
      title: `Export Performance Result ${extension.toUpperCase()}`,
      defaultPath: `postmeter-performance-result.${extension}`,
      filters: performanceExportFilters(format)
    });
    const filePath = selectedSaveFilePath(saveResult);
    if (!filePath) {
      return fileOperationResult({ cancelled: true });
    }
    if (publicResult.storeBacked === true) {
      assertCurrentStoreResult(publicResult, 'performance');
      if (format === 'csv') {
        await currentResultStore.exportCsv(filePath, { kind: 'performance', result: publicResult });
      } else if (format === 'html') {
        await currentResultStore.exportHtml(filePath, { kind: 'performance', result: publicResult, ...normalizedHtmlReportOptions });
      } else {
        await currentResultStore.exportJson(filePath, { kind: 'performance', result: publicResult });
      }
      return fileOperationResult(safeFileOperationExportResult(filePath));
    }
    const content = format === 'csv'
      ? performanceResultToCsv(publicResult)
      : format === 'html'
        ? await resultHtmlReportToHtml({ kind: 'performance', result: publicResult, ...normalizedHtmlReportOptions })
        : JSON.stringify(publicResult, null, 2);
    await writeTextFileAtomic(filePath, content, { prefix: 'postmeter-performance-result-export' });
    return fileOperationResult(safeFileOperationExportResult(filePath));
  });

  ipcMain.handle('performance:estimateResultStore', async (_event, performanceTest) => {
    assertPerformanceTestPayload(performanceTest);
    const plannedRequests = estimatePerformancePlannedRequests(performanceTest);
    return runtimeResultStoreEstimate({
      averageMetadataBytes: requestMetadataBytes(performanceTest?.request),
      capturePolicy: performanceTest.capturePolicy,
      diagnostic: performanceTest?.type === 'diagnosis',
      kind: 'performance',
      plannedRequests
    });
  });

  ipcMain.handle('runner:resultPage', async (_event, resultId, query = {}) => {
    assertRuntimeId(resultId);
    assertCurrentStoreId(resultId, 'runner');
    return currentResultStore.page({ kind: 'runner', ...safeResultQuery(query) });
  });

  ipcMain.handle('runner:resultDetail', async (_event, resultId, resultIndex = 0) => {
    assertRuntimeId(resultId);
    assertCurrentStoreId(resultId, 'runner');
    return currentResultStore.detail({ kind: 'runner', resultIndex });
  });

  ipcMain.handle('performance:resultPage', async (_event, resultId, query = {}) => {
    assertRuntimeId(resultId);
    assertCurrentStoreId(resultId, 'performance');
    return currentResultStore.page({ kind: 'performance', ...safeResultQuery(query) });
  });

  ipcMain.handle('performance:resultDetail', async (_event, resultId, resultIndex = 0) => {
    assertRuntimeId(resultId);
    assertCurrentStoreId(resultId, 'performance');
    return currentResultStore.detail({ kind: 'performance', resultIndex });
  });

  return {
    cleanupResultStore: async () => {
      closeCurrentResultStore();
      await cleanupRuntimeResultStore(resultStorePath);
    },
    closeResultStore: closeCurrentResultStore
  };
}

async function prepareRuntimeResultStore({ id, kind, capturePolicy, plannedRequests, metadata }) {
  const store = createRuntimeResultStore(prepareRuntimeResultStore.path);
  await store.reset();
  store.beginRun({
    id,
    kind,
    capturePolicy: normalizeCapturePolicy(capturePolicy, kind, {
      diagnostic: metadata?.type === 'diagnosis',
      plannedRequests
    }),
    plannedRequests,
    metadata
  });
  return store;
}

prepareRuntimeResultStore.path = '';

async function confirmHighRiskRunIfNeeded(options = {}) {
  const assessment = assessHighRiskRun(options);
  if (!assessment.highRisk || !assessment.requiresConfirmation) {
    return assessment;
  }
  await options.recordDiagnosticEvent?.({
    type: 'runtime.high-risk-run.prompted',
    level: 'warn',
    outcome: 'prompted',
    fields: assessment.fields
  });
  const accepted = await showHighRiskRunPrompt(options, assessment);
  if (!accepted) {
    await options.recordDiagnosticEvent?.({
      type: 'runtime.high-risk-run.denied',
      level: 'warn',
      outcome: 'denied',
      fields: assessment.fields
    });
    const error = new Error(`High-risk ${assessment.kind} run was cancelled before execution.`);
    error.code = 'POSTMETER_HIGH_RISK_RUN_DENIED';
    throw error;
  }
  await options.recordDiagnosticEvent?.({
    type: 'runtime.high-risk-run.accepted',
    level: 'warn',
    outcome: 'accepted',
    fields: assessment.fields
  });
  return {
    ...assessment,
    accepted: true
  };
}

async function recordHighRiskRunStarted(assessment, recordDiagnosticEvent) {
  if (!assessment?.highRisk || assessment.requiresConfirmation !== true) {
    return;
  }
  await recordDiagnosticEvent?.({
    type: 'runtime.high-risk-run.started',
    level: 'warn',
    outcome: 'started',
    fields: assessment.fields
  });
}

function assessHighRiskRun(options = {}) {
  const kind = options.kind === 'performance' ? 'performance' : 'runner';
  const workspace = options.workspace || {};
  const security = workspace.localsettings?.security || {};
  const importedUntrusted = security.importedUntrusted === true;
  const plannedRequests = boundedRuntimeNumber(options.plannedRequests, 0);
  const concurrency = boundedRuntimeNumber(options.concurrency, 1);
  const durationSeconds = boundedRuntimeNumber(options.durationSeconds, 0);
  const targetCategories = unsafeRuntimeTargetCategories(options);
  const scripts = runtimeSubjectHasScripts(options.collection || options.performanceTest);
  const fileBindings = mainOwnedFileBindings(workspace).length;
  const vaultGrantCount = trustedVaultGrantCount({
    ...(workspace.settings?.sandbox?.trustedCapabilities || {}),
    vaultGrants: scriptTrustedCapabilitiesForWorkspace(workspace).vaultGrants
  });
  const reasons = [];
  if (plannedRequests > HIGH_RISK_RUN_THRESHOLDS.plannedRequests) {
    reasons.push('planned-requests');
  }
  if (concurrency > HIGH_RISK_RUN_THRESHOLDS.concurrency) {
    reasons.push('concurrency');
  }
  if (durationSeconds > HIGH_RISK_RUN_THRESHOLDS.durationSeconds) {
    reasons.push('duration');
  }
  if (targetCategories.length) {
    reasons.push('private-target');
  }
  if (importedUntrusted) {
    reasons.push('imported-untrusted-workspace');
  }
  if (scripts) {
    reasons.push('scripts');
  }
  if (fileBindings > 0) {
    reasons.push('file-bindings');
  }
  if (vaultGrantCount > 0) {
    reasons.push('vault');
  }
  const highRisk = reasons.length > 0;
  const locallyTrusted = security.trustedWorkspace === true
    || security.allowHighRiskRuns === true
    || importedUntrusted !== true;
  return {
    kind,
    highRisk,
    requiresConfirmation: highRisk && !locallyTrusted,
    fields: {
      kind,
      plannedRequests,
      concurrency,
      durationSeconds,
      importedUntrusted,
      scripts,
      fileBindings,
      vaultGrants: vaultGrantCount,
      targetCategories,
      reasons
    }
  };
}

async function showHighRiskRunPrompt(options = {}, assessment = {}) {
  if (!options.dialog || typeof options.dialog.showMessageBox !== 'function') {
    return false;
  }
  const fields = assessment.fields || {};
  const detailLines = [
    `Run type: ${assessment.kind || 'runtime'}`,
    `Planned requests: ${fields.plannedRequests || 0}`,
    `Concurrency: ${fields.concurrency || 1}`,
    `Duration: ${fields.durationSeconds || 0}s`,
    `Reasons: ${(fields.reasons || []).join(', ') || 'none'}`
  ];
  if (Array.isArray(fields.targetCategories) && fields.targetCategories.length) {
    detailLines.push(`Target categories: ${fields.targetCategories.join(', ')}`);
  }
  const result = await options.dialog.showMessageBox(options.getMainWindow?.(), {
    type: 'warning',
    buttons: ['Run Once', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title: 'High-Risk Run',
    message: 'Imported workspace wants to start a high-risk run.',
    detail: detailLines.join('\n')
  });
  return result?.response === 0;
}

function unsafeRuntimeTargetCategories(options = {}) {
  const urls = runtimeSubjectUrls(options.collection || options.performanceTest).slice(0, 50);
  const categories = new Set();
  for (const rawUrl of urls) {
    try {
      const url = new URL(String(rawUrl || ''));
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        continue;
      }
      const classification = classifyHostname(url.hostname);
      if (classification.category !== 'public' && classification.category !== 'invalid') {
        categories.add(classification.category);
      }
    } catch {
      continue;
    }
  }
  return [...categories].sort();
}

function runtimeSubjectUrls(subject = {}) {
  if (subject?.request) {
    return [subject.request.url].filter(Boolean);
  }
  const urls = [];
  const visit = (node = {}) => {
    for (const request of node.requests || []) {
      if (request?.url) {
        urls.push(request.url);
      }
    }
    for (const folder of node.folders || []) {
      visit(folder);
    }
  };
  visit(subject);
  return urls;
}

function runtimeSubjectHasScripts(subject = {}) {
  if (!subject || typeof subject !== 'object') {
    return false;
  }
  if (scriptsPayloadHasText(subject.scripts)) {
    return true;
  }
  if (subject.request && scriptsPayloadHasText(subject.request.scripts)) {
    return true;
  }
  for (const request of subject.requests || []) {
    if (scriptsPayloadHasText(request?.scripts)) {
      return true;
    }
  }
  for (const folder of subject.folders || []) {
    if (runtimeSubjectHasScripts(folder)) {
      return true;
    }
  }
  return false;
}

function scriptsPayloadHasText(scripts = {}) {
  if (!scripts || typeof scripts !== 'object') {
    return false;
  }
  return ['preRequest', 'tests', 'preRequestScript', 'testScript'].some((key) => {
    return String(scripts[key] || '').trim().length > 0;
  });
}

function trustedVaultGrantCount(trustedCapabilities = {}) {
  const grants = trustedCapabilities?.vaultGrants;
  if (Array.isArray(grants)) {
    return grants.length;
  }
  if (grants && typeof grants === 'object') {
    return Object.keys(grants).length;
  }
  return trustedCapabilities?.vault === true ? 1 : 0;
}

function estimatePerformanceConcurrency(performanceTest = {}) {
  const type = String(performanceTest.type || '').trim();
  const config = performanceTest.config || {};
  const safety = performanceTest.safetyLimits || {};
  const maxConfigured = Math.max(
    boundedRuntimeNumber(config.startConcurrency, 1),
    boundedRuntimeNumber(config.concurrency, 1),
    type === 'spike' || type === 'diagnosis'
      ? boundedRuntimeNumber(config.concurrency, 1) * boundedRuntimeNumber(config.spikeMultiplier, 1)
      : 1
  );
  const maxSafety = boundedRuntimeNumber(safety.maxConcurrency, maxConfigured);
  return Math.min(maxConfigured, Math.max(1, maxSafety));
}

function estimatePerformanceDurationSeconds(performanceTest = {}) {
  const config = performanceTest.config || {};
  const safety = performanceTest.safetyLimits || {};
  const configured = boundedRuntimeNumber(config.durationSeconds, 0);
  if (configured > 0) {
    return configured;
  }
  return boundedRuntimeNumber(safety.maxDurationSeconds, 0);
}

function boundedRuntimeNumber(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return fallback;
  }
  return Math.floor(number);
}

async function runtimeResultStoreEstimate(options = {}) {
  const estimate = estimateRuntimeResultStoreSize(options);
  const disk = await resultStoreDiskSpace(prepareRuntimeResultStore.path);
  const effectiveAvailableBytes = disk.availableBytes == null
    ? null
    : disk.availableBytes + disk.existingResultStoreBytes;
  const exceedsAvailable = effectiveAvailableBytes != null && estimate.estimatedBytes > effectiveAvailableBytes;
  const withinAvailableMargin = effectiveAvailableBytes != null
    && !exceedsAvailable
    && effectiveAvailableBytes - estimate.estimatedBytes <= RESULT_STORE_WARNING_MARGIN_BYTES;
  return {
    ...estimate,
    ...disk,
    effectiveAvailableBytes,
    warningMarginBytes: RESULT_STORE_WARNING_MARGIN_BYTES,
    exceedsAvailable,
    withinAvailableMargin,
    shouldWarn: exceedsAvailable || withinAvailableMargin,
    canContinue: !exceedsAvailable
  };
}

async function resultStoreDiskSpace(filePath) {
  const directory = path.dirname(path.resolve(filePath));
  await fs.mkdir(directory, { recursive: true });
  const existingResultStoreBytes = await existingResultStoreSize(filePath);
  try {
    const stats = await fs.statfs(directory);
    const availableBytes = Number(stats.bavail) * Number(stats.bsize);
    return {
      availableBytes: Number.isFinite(availableBytes) ? availableBytes : null,
      existingResultStoreBytes,
      resultStoreDirectory: directory
    };
  } catch {
    return {
      availableBytes: null,
      existingResultStoreBytes,
      resultStoreDirectory: directory
    };
  }
}

async function existingResultStoreSize(filePath) {
  let total = 0;
  for (const candidate of runtimeResultStoreFiles(filePath)) {
    const stat = await fs.stat(candidate).catch(() => null);
    if (stat?.isFile?.()) {
      total += Number(stat.size || 0);
    }
  }
  return total;
}

function storedCollectionRunResult(result, store) {
  const page = store.page({ kind: 'runner', offset: 0, limit: 50, status: 'all' });
  return {
    ...result,
    id: store.runId,
    resultStoreId: store.runId,
    storeBacked: true,
    capturePolicy: store.capturePolicy,
    detailCaptureTruncated: store.detailCaptureTruncated,
    detailCaptureTruncationReason: store.detailCaptureTruncationReason,
    httpResponses: httpResponseCountFromStatusCounts(page.statusCounts),
    resultPage: {
      offset: page.offset,
      limit: page.limit,
      total: page.total,
      totalAll: page.totalAll,
      statusCounts: page.statusCounts
    },
    results: page.items
  };
}

function storedPerformanceResult(result, store) {
  const page = store.page({ kind: 'performance', offset: 0, limit: 50, status: 'all' });
  return {
    ...result,
    resultStoreId: store.runId,
    storeBacked: true,
    capturePolicy: store.capturePolicy,
    detailCaptureTruncated: store.detailCaptureTruncated,
    detailCaptureTruncationReason: store.detailCaptureTruncationReason,
    resultPage: {
      offset: page.offset,
      limit: page.limit,
      total: page.total,
      totalAll: page.totalAll,
      statusCounts: page.statusCounts
    },
    samples: page.items
  };
}

function safeResultQuery(query = {}) {
  const input = query && typeof query === 'object' && !Array.isArray(query) ? query : {};
  return {
    offset: Math.max(0, Math.floor(Number(input.offset || 0))),
    limit: Math.min(500, Math.max(1, Math.floor(Number(input.limit || 50)))),
    status: String(input.status || 'all').slice(0, 16)
  };
}

function assertCurrentStoreResult(result, kind) {
  assertCurrentStoreId(result?.resultStoreId || result?.id, kind);
}

function assertCurrentStoreId(resultId, kind) {
  const store = currentStoreAccessor.getStore();
  if (!store || store.runId !== resultId || store.kind !== kind) {
    throw new Error('The requested run result is no longer available. Run the test again before exporting or inspecting it.');
  }
}

const currentStoreAccessor = {
  getStore: () => null
};

function httpResponseCountFromStatusCounts(statusCounts = {}) {
  return Object.entries(statusCounts).reduce((total, [status, count]) => {
    return /^\d+$/.test(status) ? total + Number(count || 0) : total;
  }, 0);
}

function resultExportExtension(format) {
  if (format === 'csv') {
    return 'csv';
  }
  if (format === 'html') {
    return 'html';
  }
  return 'json';
}

function estimatePerformancePlannedRequests(performanceTest = {}) {
  const type = String(performanceTest.type || '').trim();
  const config = performanceTest.config || {};
  const safety = performanceTest.safetyLimits || {};
  if (type === 'diagnosis') {
    return Number(config.iterations || safety.maxTotalRequests || 1);
  }
  if (type === 'soak') {
    return Number(safety.maxTotalRequests || config.iterations || 1);
  }
  if (type === 'concurrency') {
    return Number(config.iterations || 1) * Number(config.concurrency || 1);
  }
  if (type === 'stress' || type === 'ramp') {
    return Number(config.iterations || 1) * Number(config.rampSteps || 1);
  }
  return Number(config.iterations || safety.maxTotalRequests || 1);
}

function averageRunnerRequestMetadataBytes(runner = {}) {
  let totalBytes = 0;
  let totalRequests = 0;
  for (const request of runner.requests || []) {
    const iterations = Math.max(1, Math.floor(Number(request?.iterations) || 1));
    totalBytes += requestMetadataBytes(request) * iterations;
    totalRequests += iterations;
  }
  return totalRequests ? Math.ceil(totalBytes / totalRequests) : 0;
}

function averageCollectionRequestMetadataBytes(collection = {}) {
  let totalBytes = 0;
  let totalRequests = 0;
  const visit = (node, folderPath = []) => {
    for (const request of node?.requests || []) {
      totalBytes += requestMetadataBytes(request, folderPath);
      totalRequests += 1;
    }
    for (const folder of node?.folders || []) {
      visit(folder, [...folderPath, folder?.name || '']);
    }
  };
  visit(collection, []);
  return totalRequests ? Math.ceil(totalBytes / totalRequests) : 0;
}

function requestMetadataBytes(request = {}, folderPath = []) {
  return byteLength([
    request?.id,
    request?.name,
    request?.method,
    request?.url,
    request?.requestDisplayName,
    Array.isArray(folderPath) ? folderPath.join('/') : ''
  ].filter(Boolean).join(' '));
}

function byteLength(value) {
  return Buffer.byteLength(String(value || ''), 'utf8');
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

function performanceCalibrationOptionsForRuntime(env = process.env) {
  if (env?.POSTMETER_UI_REGRESSION_SMOKE !== '1') {
    return {};
  }
  return {
    profile: {
      warmupTargetRequestsPerSecond: 10,
      warmupDurationMillis: 50,
      probeDurationMillis: 60,
      confirmationDurationMillis: 60,
      confirmationPasses: 1,
      sampleIntervalMillis: 20,
      schedulerTickMillis: 5,
      maxLatencySamples: 1000,
      maxConcurrency: 16,
      targetRates: [10, 20],
      minCompletionRatio: 0.5,
      minIntervalRatio: 0,
      maxP95StartLagMillis: 1000,
      maxP95EventLoopDelayMillis: 1000,
      maxConfirmationVariationPercent: 100
    }
  };
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

function createProgressDelivery({ abortController, assertPayload, channel, event, id, label, minIntervalMillis = 0 }) {
  let deliveryError = null;
  let pendingProgress = null;
  let timer = null;
  let lastSentAtMillis = 0;
  const normalizedMinIntervalMillis = Math.max(0, Math.floor(Number(minIntervalMillis || 0)));
  const sendNow = (progress) => {
    assertPayload(progress);
    if (!event?.sender || event.sender?.isDestroyed?.() === true) {
      throw new Error('renderer sender is destroyed');
    }
    event.sender.send(channel, { id, progress });
    lastSentAtMillis = Date.now();
  };
  const clearDeliveryTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const failDelivery = (error) => {
    const message = error.message || String(error);
    deliveryError = new Error(`${label} delivery failed: ${message}`);
    clearDeliveryTimer();
    abortController.abort();
  };
  const flushPending = () => {
    if (!pendingProgress || deliveryError) {
      return;
    }
    const progress = pendingProgress;
    pendingProgress = null;
    clearDeliveryTimer();
    try {
      sendNow(progress);
    } catch (error) {
      failDelivery(error);
    }
  };
  const schedulePendingFlush = () => {
    if (timer || !pendingProgress || deliveryError) {
      return;
    }
    const elapsed = Date.now() - lastSentAtMillis;
    const delay = Math.max(0, normalizedMinIntervalMillis - elapsed);
    timer = setTimeout(flushPending, delay);
    timer.unref?.();
  };
  return {
    send(progress) {
      if (deliveryError) {
        return;
      }
      if (!normalizedMinIntervalMillis) {
        try {
          sendNow(progress);
        } catch (error) {
          failDelivery(error);
        }
        return;
      }
      const now = Date.now();
      if (!lastSentAtMillis || now - lastSentAtMillis >= normalizedMinIntervalMillis) {
        pendingProgress = null;
        clearDeliveryTimer();
        try {
          sendNow(progress);
        } catch (error) {
          failDelivery(error);
        }
        return;
      }
      pendingProgress = progress;
      schedulePendingFlush();
    },
    flush: flushPending,
    dispose() {
      pendingProgress = null;
      clearDeliveryTimer();
    },
    throwIfFailed() {
      flushPending();
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

function publicPerformanceResult(result) {
  return cloneJson(result) || {};
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
  return Array.isArray(runner.requests)
    ? runner.requests.reduce((total, request) => total + Math.max(1, Math.floor(Number(request?.iterations) || 1)), 0)
    : 0;
}

function normalizeFileImportSource(source, label, env = process.env) {
  if (source == null) {
    return { filePath: '', text: null, fileName: '' };
  }
  if (typeof source === 'string') {
    throw new Error(`${label} cannot be supplied by the renderer. Use the native file picker or provide bounded file contents.`);
  }
  const value = source && typeof source === 'object' ? source : {};
  if (typeof value.text === 'string') {
    if (value.text.length > IMPORT_TEXT_LIMIT) {
      throw new Error(`${label} content must be ${IMPORT_TEXT_LIMIT} characters or fewer.`);
    }
    return {
      filePath: '',
      text: value.text,
      fileName: safeFilename(value.fileName || value.name || 'import.json')
    };
  }
  if (typeof value.filePath === 'string' && value.filePath.trim()) {
    throw new Error(`${label} cannot be supplied by the renderer. Use the native file picker or provide bounded file contents.`);
  }
  return { filePath: '', text: null, fileName: '' };
}

async function readTextImportSource(source, label, chooseFilePath, options = {}) {
  const normalized = normalizeFileImportSource(source, label, options.env);
  if (normalized.text != null) {
    return normalized;
  }
  const filePath = await chooseFilePath();
  if (!filePath) {
    return null;
  }
  const text = await fs.readFile(validateDialogFilePath(filePath, label), 'utf8');
  if (text.length > IMPORT_TEXT_LIMIT) {
    throw new Error(`${label} content must be ${IMPORT_TEXT_LIMIT} characters or fewer.`);
  }
  return {
    filePath,
    text,
    fileName: path.basename(filePath)
  };
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

function mainOwnedFileBindings(workspace = {}) {
  return mainOwnedFileBindingsForWorkspace(workspace);
}

function safeFileOperationExportResult(filePath) {
  const displayPath = path.basename(String(filePath || '')) || 'export';
  return {
    cancelled: false,
    path: displayPath,
    displayPath
  };
}

function scriptTrustedCapabilitiesForWorkspace(workspace = {}) {
  const trusted = workspace.settings?.sandbox?.trustedCapabilities || {};
  return {
    sendRequest: trusted.sendRequest !== false,
    cookies: trusted.cookies !== false,
    vault: false,
    vaultGrants: workspace.localsettings?.sandbox?.trustedCapabilities?.vaultGrants || {}
  };
}

module.exports = {
  registerRuntimeIpc
};
