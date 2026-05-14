const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { registerRuntimeIpc } = require('../../electron/runtimeIpc');
const { defaultPerformanceTest } = require('../../src/core/models');
const { defaultDiagnosticsSettings, sanitizeDiagnosticEvent } = require('../../src/core/diagnostics');

test('runtime IPC registers stable runner channels', async () => {
  const handlers = new Map();
  registerRuntimeIpc({
    dialog: { showSaveDialog: async () => ({ canceled: true }) },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => ({ cookies: [] }),
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    saveWorkspace: async (workspace) => workspace,
    setWorkspace: () => {}
  });

  assert.deepEqual([...handlers.keys()].sort(), [
    'performance:calibrate',
    'performance:calibrate:cancel',
    'performance:cancel',
    'performance:estimateResultStore',
    'performance:export',
    'performance:exportResult',
    'performance:import',
    'performance:resultDetail',
    'performance:resultPage',
    'performance:start',
    'runner:cancel',
    'runner:estimateResultStore',
    'runner:export',
    'runner:resultDetail',
    'runner:resultPage',
    'runner:start'
  ]);
  assert.equal(await handlers.get('runner:cancel')(null, 'runner-id'), false);
  assert.equal(await handlers.get('performance:calibrate:cancel')(null, 'calibration-id'), false);
});

test('runtime IPC estimates temp result store size before runs', async () => {
  const handlers = new Map();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-runtime-estimate-'));
  const resultStorePath = path.join(tempDir, 'current.sqlite');
  try {
    await fs.writeFile(resultStorePath, 'existing-result');
    registerRuntimeIpc({
      dialog: { showSaveDialog: async () => ({ canceled: true }) },
      fileOperationResult: (result) => result,
      getMainWindow: () => null,
      getWorkspace: () => ({ cookies: [] }),
      ipcMain: {
        handle(channel, handler) {
          handlers.set(channel, handler);
        }
      },
      resultStorePath,
      saveWorkspace: async (workspace) => workspace,
      setWorkspace: () => {}
    });

    const runnerEstimate = await handlers.get('runner:estimateResultStore')({}, {
      id: 'runner-estimate',
      name: 'Runner Estimate',
      environmentId: 'none',
      requests: [
        { id: 'request-a', name: 'A', method: 'GET', url: 'https://example.test/a', iterations: 2 },
        { id: 'request-b', name: 'B', method: 'GET', url: 'https://example.test/b', iterations: 1 }
      ]
    }, { capturePolicy: { responseBody: 'none' } });
    assert.equal(runnerEstimate.kind, 'runner');
    assert.equal(runnerEstimate.plannedRequests, 3);
    assert.ok(runnerEstimate.estimatedBytes > 0);
    assert.ok(runnerEstimate.existingResultStoreBytes >= 'existing-result'.length);
    assert.equal(typeof runnerEstimate.canContinue, 'boolean');

    const performanceEstimate = await handlers.get('performance:estimateResultStore')({}, defaultPerformanceTest({
      id: 'performance-estimate',
      type: 'latency',
      request: { id: 'request-1', name: 'Target', method: 'GET', url: 'https://example.test' },
      config: { iterations: 5 },
      safetyLimits: { maxTotalRequests: 5, maxConcurrency: 1, maxDurationSeconds: 60 }
    }));
    assert.equal(performanceEstimate.kind, 'performance');
    assert.equal(performanceEstimate.plannedRequests, 5);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime IPC imports renderer-selected performance test files without reopening native dialogs', async () => {
  const handlers = new Map();
  let openDialogCalls = 0;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-performance-import-'));
  try {
    const filePath = path.join(tempDir, 'latency-test.postmeter-performance.json');
    const performanceTest = defaultPerformanceTest({
      id: 'performance-1',
      name: 'Imported Latency',
      type: 'latency',
      request: { id: 'request-1', name: 'Target', method: 'GET', url: 'https://example.test' }
    });
    await fs.writeFile(filePath, JSON.stringify({
      format: 'postmeter.performance.v1',
      performanceTest
    }), 'utf8');

    registerRuntimeIpc({
      dialog: {
        showOpenDialog: async () => {
          openDialogCalls += 1;
          return { canceled: true, filePaths: [] };
        },
        showSaveDialog: async () => ({ canceled: true })
      },
      fileOperationResult: (result) => result,
      getMainWindow: () => null,
      getWorkspace: () => ({ cookies: [] }),
      ipcMain: {
        handle(channel, handler) {
          handlers.set(channel, handler);
        }
      },
      saveWorkspace: async (workspace) => workspace,
      setWorkspace: () => {}
    });

    const result = await handlers.get('performance:import')({}, filePath);
    assert.equal(openDialogCalls, 0);
    assert.equal(result.cancelled, false);
    assert.equal(result.performanceTest.name, 'Imported Latency');
    await assert.rejects(
      () => handlers.get('performance:import')({}, 'bad\0path.json'),
      /performance import path must not contain null bytes/
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime IPC runs and cancels performance calibration', async () => {
  const handlers = new Map();
  const events = [];
  const progressMessages = [];
  let capturedSignal = null;
  const fakeEvent = {
    sender: {
      isDestroyed: () => false,
      send: (channel, payload) => progressMessages.push({ channel, payload })
    }
  };
  registerRuntimeIpc({
    dialog: { showSaveDialog: async () => ({ canceled: true }) },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => ({ cookies: [] }),
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    recordDiagnosticEvent: async (event) => {
      events.push(event);
    },
    runPerformanceCalibration: async ({ signal, onProgress }) => {
      capturedSignal = signal;
      onProgress({
        kind: 'calibration',
        phase: 'warmup',
        phaseLabel: 'Warmup',
        message: 'Unit progress',
        percent: 10,
        phasePercent: 50,
        completedRequests: 1,
        totalRequests: 2
      });
      return await new Promise((resolve) => {
        signal.addEventListener('abort', () => {
          resolve({
            id: 'calibration-result-1',
            startedAt: '2026-05-06T00:00:00.000Z',
            completedAt: '2026-05-06T00:00:01.000Z',
            durationMillis: 1000,
            cancelled: true,
            endpoint: '127.0.0.1',
            summary: {
              peakRequestsPerSecond: 10,
              peakConcurrency: 1,
              averageLatencyMillis: 2,
              p95LatencyMillis: 3,
              completedRequests: 1,
              failedRequests: 0,
              notes: ['cancelled']
            },
            stages: [{
              name: 'Unit',
              concurrency: 1,
              requestedRequests: 10,
              completedRequests: 1,
              failedRequests: 0,
              durationMillis: 100,
              requestsPerSecond: 10,
              averageLatencyMillis: 2,
              p95LatencyMillis: 3,
              p99LatencyMillis: 4
            }]
          });
        }, { once: true });
      });
    },
    saveWorkspace: async (workspace) => workspace,
    setWorkspace: () => {}
  });

  const run = handlers.get('performance:calibrate')(fakeEvent, 'calibration-run-1');
  assert.equal(capturedSignal.aborted, false);
  assert.equal(await handlers.get('performance:calibrate:cancel')(null, 'calibration-run-1'), true);
  const result = await run;
  assert.equal(result.cancelled, true);
  assert.equal(capturedSignal.aborted, true);
  assert.equal(progressMessages[0].channel, 'performance:progress');
  assert.equal(progressMessages[0].payload.id, 'calibration-run-1');
  assert.equal(progressMessages[0].payload.progress.kind, 'calibration');
  assert.deepEqual(events.map((event) => event.type), ['performance.calibration.completed']);
});

test('runtime IPC starts performance runs with progress, diagnostics, and allowed environment mutation', async () => {
  const handlers = new Map();
  const progressMessages = [];
  const events = [];
  const workspace = {
    cookies: [],
    globals: [],
    settings: { sandbox: { fileBindings: [], packageCache: [], trustedCapabilities: {} } },
    environments: [{
      id: 'env-1',
      name: 'Env',
      variables: [{ enabled: true, key: 'token', value: 'base' }]
    }]
  };
  registerRuntimeIpc({
    dialog: { showSaveDialog: async () => ({ canceled: true }) },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => workspace,
    getWorkspaceId: () => 'workspace-1',
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    mutateWorkspace: async (mutator) => {
      await mutator(workspace);
      return workspace;
    },
    recordDiagnosticEvent: async (event) => {
      events.push(event);
    },
    runPerformanceTest: async (performanceTest, environment, options) => {
      options.onProgress({
        completedRequests: 1,
        totalRequests: 1,
        activeRequests: 0,
        requestId: performanceTest.request.id,
        requestName: performanceTest.request.name,
        passed: true,
        durationMillis: 14
      });
      return {
        id: 'perf-result-1',
        performanceTestId: performanceTest.id,
        performanceTestName: performanceTest.name,
        type: performanceTest.type,
        environmentId: environment.id,
        environmentMutationAllowed: true,
        totalRequests: 1,
        completedRequests: 1,
        successfulRequests: 1,
        failedRequests: 0,
        passed: true,
        cancelled: false,
        startedAt: '2026-05-06T00:00:00.000Z',
        completedAt: '2026-05-06T00:00:01.000Z',
        durationMillis: 14,
        config: performanceTest.config,
        safetyLimits: performanceTest.safetyLimits,
        summary: { requestsPerSecond: 1, statusCodes: { 200: 1 } },
        samples: [{
          iteration: 1,
          requestId: performanceTest.request.id,
          requestName: performanceTest.request.name,
          startedAt: '2026-05-06T00:00:00.000Z',
          statusCode: 200,
          durationMillis: 14,
          passed: true,
          error: ''
        }],
        environment: {
          id: 'env-1',
          name: 'Env',
          variables: [{ enabled: true, key: 'token', value: 'runtime' }]
        },
        mutatedEnvironment: {
          id: 'env-1',
          name: 'Env',
          variables: [{ enabled: true, key: 'token', value: 'runtime' }]
        },
        cookies: []
      };
    },
    saveWorkspace: async (nextWorkspace) => nextWorkspace,
    setWorkspace: () => {}
  });

  const performanceTest = defaultPerformanceTest({
    id: 'perf-1',
    name: 'Latency',
    type: 'latency',
    request: { id: 'request-1', name: 'Target', method: 'GET', url: 'https://example.test' },
    allowEnvironmentMutation: true,
    environmentId: 'env-1',
    config: { iterations: 1 },
    safetyLimits: { maxTotalRequests: 1, maxConcurrency: 1, maxDurationSeconds: 60 }
  });
  const result = await handlers.get('performance:start')({
    sender: {
      isDestroyed: () => false,
      send(channel, payload) {
        progressMessages.push({ channel, payload });
      }
    }
  }, 'performance-run-1', performanceTest, workspace.environments[0]);

  assert.equal(result.passed, true);
  assert.equal(result.samples[0].statusCode, 200);
  assert.equal(progressMessages[0].channel, 'performance:progress');
  assert.equal(progressMessages[0].payload.id, 'performance-run-1');
  assert.equal(workspace.environments[0].variables[0].value, 'runtime');
  assert.deepEqual(events.map((event) => event.type), ['performance.start.completed']);
});

test('runtime IPC coalesces high-rate performance progress delivery', async () => {
  const handlers = new Map();
  const progressMessages = [];
  const workspace = {
    cookies: [],
    globals: [],
    settings: { sandbox: { fileBindings: [], packageCache: [], trustedCapabilities: {} } },
    environments: []
  };
  registerRuntimeIpc({
    dialog: { showSaveDialog: async () => ({ canceled: true }) },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => workspace,
    getWorkspaceId: () => 'workspace-1',
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    mutateWorkspace: async (mutator) => {
      await mutator(workspace);
      return workspace;
    },
    recordDiagnosticEvent: async () => {},
    runPerformanceTest: async (performanceTest, _environment, options) => {
      for (let index = 1; index <= 20; index += 1) {
        options.onProgress({
          completedRequests: index,
          totalRequests: 20,
          activeRequests: 20 - index,
          requestId: performanceTest.request.id,
          requestName: performanceTest.request.name,
          passed: true,
          durationMillis: index
        });
      }
      return {
        id: 'perf-coalesced-result',
        performanceTestId: performanceTest.id,
        performanceTestName: performanceTest.name,
        type: performanceTest.type,
        environmentId: 'none',
        environmentMutationAllowed: false,
        totalRequests: 20,
        completedRequests: 20,
        successfulRequests: 20,
        failedRequests: 0,
        passed: true,
        cancelled: false,
        startedAt: '2026-05-06T00:00:00.000Z',
        completedAt: '2026-05-06T00:00:01.000Z',
        durationMillis: 1000,
        config: performanceTest.config,
        safetyLimits: performanceTest.safetyLimits,
        summary: { requestsPerSecond: 20, statusCodes: { 200: 20 } },
        samples: [{
          iteration: 1,
          requestId: performanceTest.request.id,
          requestName: performanceTest.request.name,
          startedAt: '2026-05-06T00:00:00.000Z',
          statusCode: 200,
          durationMillis: 1,
          passed: true,
          error: ''
        }],
        environment: { id: 'runtime', name: 'Runtime', variables: [] },
        cookies: []
      };
    },
    saveWorkspace: async (nextWorkspace) => nextWorkspace,
    setWorkspace: () => {}
  });

  const performanceTest = defaultPerformanceTest({
    id: 'perf-coalesced',
    name: 'Coalesced',
    type: 'throughput',
    request: { id: 'request-1', name: 'Target', method: 'GET', url: 'https://example.test' },
    config: { iterations: 20, concurrency: 5 },
    safetyLimits: { maxTotalRequests: 20, maxConcurrency: 5, maxDurationSeconds: 60 }
  });
  await handlers.get('performance:start')({
    sender: {
      isDestroyed: () => false,
      send(channel, payload) {
        progressMessages.push({ channel, payload });
      }
    }
  }, 'performance-coalesced-run', performanceTest, null);

  assert.ok(progressMessages.length <= 2);
  assert.equal(progressMessages[0].payload.progress.completedRequests, 1);
  assert.equal(progressMessages.at(-1).payload.progress.completedRequests, 20);
});

test('runtime IPC keeps performance environment mutations temporary unless the result explicitly allows persistence', async () => {
  const handlers = new Map();
  const workspace = {
    cookies: [],
    globals: [],
    settings: { sandbox: { fileBindings: [], packageCache: [], trustedCapabilities: {} } },
    environments: [{
      id: 'env-1',
      name: 'Env',
      variables: [{ enabled: true, key: 'token', value: 'base' }]
    }]
  };
  registerRuntimeIpc({
    dialog: { showSaveDialog: async () => ({ canceled: true }) },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => workspace,
    getWorkspaceId: () => 'workspace-1',
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    mutateWorkspace: async (mutator) => {
      await mutator(workspace);
      return workspace;
    },
    runPerformanceTest: async (performanceTest, environment) => ({
      id: 'perf-result-2',
      performanceTestId: performanceTest.id,
      performanceTestName: performanceTest.name,
      type: performanceTest.type,
      environmentId: environment.id,
      environmentMutationAllowed: false,
      totalRequests: 1,
      completedRequests: 1,
      successfulRequests: 1,
      failedRequests: 0,
      passed: true,
      cancelled: false,
      startedAt: '2026-05-06T00:00:00.000Z',
      completedAt: '2026-05-06T00:00:01.000Z',
      durationMillis: 8,
      config: performanceTest.config,
      safetyLimits: performanceTest.safetyLimits,
      summary: {},
      samples: [],
      environment: {
        id: 'env-1',
        name: 'Env',
        variables: [{ enabled: true, key: 'token', value: 'temporary' }]
      },
      cookies: []
    }),
    saveWorkspace: async (nextWorkspace) => nextWorkspace,
    setWorkspace: () => {}
  });

  const performanceTest = defaultPerformanceTest({
    id: 'perf-2',
    name: 'Temporary',
    type: 'concurrency',
    request: { id: 'request-1', name: 'Target', method: 'GET', url: 'https://example.test' },
    allowEnvironmentMutation: false,
    environmentId: 'env-1',
    config: { iterations: 1, concurrency: 1 },
    safetyLimits: { maxTotalRequests: 1, maxConcurrency: 1, maxDurationSeconds: 60 }
  });
  const result = await handlers.get('performance:start')({
    sender: {
      isDestroyed: () => false,
      send() {}
    }
  }, 'performance-run-2', performanceTest, workspace.environments[0]);

  assert.equal(result.environment.variables[0].value, 'temporary');
  assert.equal(result.mutatedEnvironment, undefined);
  assert.equal(workspace.environments[0].variables[0].value, 'base');
});

test('runtime IPC runs full endpoint diagnosis with SQLite paging detail and diagnostic CSV export', async () => {
  const handlers = new Map();
  const progressMessages = [];
  const events = [];
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-runtime-diagnosis-'));
  const resultStorePath = path.join(tempDir, 'current.sqlite');
  const csvExportPath = path.join(tempDir, 'diagnosis-export.csv');
  const jsonExportPath = path.join(tempDir, 'diagnosis-export.json');
  const htmlExportPath = path.join(tempDir, 'diagnosis-export.html');
  const compactHtmlExportPath = path.join(tempDir, 'diagnosis-export-compact.html');
  const exportPaths = [csvExportPath, jsonExportPath, htmlExportPath, compactHtmlExportPath];
  const server = await createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'max-age=30');
    response.setHeader('ETag', '"runtime-diagnosis"');
    response.setHeader('Server-Timing', 'app;dur=2');
    response.setHeader('X-Request-ID', 'runtime-diagnosis-request');
    response.setHeader('RateLimit-Limit', '100');
    response.setHeader('RateLimit-Remaining', '99');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Strict-Transport-Security', 'max-age=31536000');
    response.setHeader('Content-Security-Policy', "default-src 'none'");
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method === 'OPTIONS') {
      response.statusCode = 204;
      response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      response.end();
      return;
    }
    response.statusCode = 200;
    response.end(JSON.stringify({ ok: true, method: request.method, url: request.url }));
  });
  const workspace = {
    cookies: [],
    globals: [],
    settings: { sandbox: { fileBindings: [], packageCache: [], trustedCapabilities: {} } },
    environments: []
  };
  let controller;
  try {
    controller = registerRuntimeIpc({
      dialog: { showSaveDialog: async () => ({ filePath: exportPaths.shift(), canceled: false }) },
      fileOperationResult: (result) => result,
      getMainWindow: () => null,
      getWorkspace: () => workspace,
      getWorkspaceId: () => 'workspace-diagnosis',
      ipcMain: {
        handle(channel, handler) {
          handlers.set(channel, handler);
        }
      },
      mutateWorkspace: async (mutator) => mutator(workspace),
      recordDiagnosticEvent: async (event) => {
        events.push(event);
      },
      resultStorePath,
      saveWorkspace: async (nextWorkspace) => nextWorkspace,
      setWorkspace: () => {}
    });

    const performanceTest = defaultPerformanceTest({
      id: 'perf-runtime-diagnosis',
      name: 'Runtime Diagnosis',
      type: 'diagnosis',
      request: {
        id: 'request-runtime-diagnosis',
        name: 'Runtime Diagnosis Endpoint',
        method: 'GET',
        url: `${server.baseUrl}/diagnostic?api_key=demo`
      },
      config: { diagnosisScope: 'quick', concurrency: 5, spikeMultiplier: 2 },
      safetyLimits: { maxTotalRequests: 44, maxConcurrency: 10, maxDurationSeconds: 60 }
    });

    const estimate = await handlers.get('performance:estimateResultStore')({}, performanceTest);
    assert.equal(estimate.kind, 'performance');
    assert.equal(estimate.plannedRequests, 44);
    assert.equal(estimate.canContinue, true);

    const result = await handlers.get('performance:start')({
      sender: {
        isDestroyed: () => false,
        send(channel, payload) {
          progressMessages.push({ channel, payload });
        }
      }
    }, 'performance-diagnosis-run', performanceTest, null);

    assert.equal(result.storeBacked, true);
    assert.equal(result.resultStoreId, 'performance-diagnosis-run');
    assert.equal(result.type, 'diagnosis');
    assert.equal(result.completedRequests, 44);
    assert.equal(result.totalRequests, 44);
    assert.equal(result.resultPage.totalAll, 44);
    assert.equal(result.samples.length, 44);
    assert.equal(result.summary.diagnosis.completedChecks, result.summary.diagnosis.requestedChecks);
    assert.equal(progressMessages.at(-1).payload.progress.completedRequests, 44);
    assert.deepEqual(events.map((event) => event.type), ['performance.start.completed']);

    const page = await handlers.get('performance:resultPage')({}, result.resultStoreId, { offset: 5, limit: 7, status: 'all' });
    assert.equal(page.totalAll, 44);
    assert.equal(page.items.length, 7);
    assert.deepEqual(page.items.map((item) => item.resultIndex), [5, 6, 7, 8, 9, 10, 11]);
    const okPage = await handlers.get('performance:resultPage')({}, result.resultStoreId, { offset: 0, limit: 5, status: '200' });
    assert.ok(okPage.total > 0);
    assert.ok(okPage.items.every((item) => item.statusCode === 200));

    const detail = await handlers.get('performance:resultDetail')({}, result.resultStoreId, 0);
    assert.equal(detail.requestId, 'request-runtime-diagnosis');
    assert.equal(detail.statusCode, 200);
    assert.match(detail.requestUrl, /\/diagnostic\?api_key=demo/);
    assert.ok(detail.responseHeaders?.['content-type']);
    assert.ok(detail.timings && typeof detail.timings === 'object');

    const exported = await handlers.get('performance:exportResult')({}, result, 'csv');
    assert.equal(exported.cancelled, false);
    const csv = await fs.readFile(csvExportPath, 'utf8');
    assert.match(csv, /diagnosticGroup,diagnostic,status,value,details/);
    assert.match(csv, /Response,Time to first byte,/);
    assert.match(csv, /phase,requests,concurrency,successfulResponses,failedResponses/);
    assert.match(csv, /index,iteration,phase,stageName,stageConcurrency/);
    assert.match(csv, /bodySha256/);

    const exportedJson = await handlers.get('performance:exportResult')({}, result, 'json');
    assert.equal(exportedJson.cancelled, false);
    const json = JSON.parse(await fs.readFile(jsonExportPath, 'utf8'));
    assert.equal(json.metadata.kind, 'performance');
    assert.equal(json.result.resultStoreId, result.resultStoreId);
    assert.equal(json.items.length, 44);
    assert.ok(json.items.some((sample) => sample.bodySha256));

    const exportedHtml = await handlers.get('performance:exportResult')({}, result, 'html');
    assert.equal(exportedHtml.cancelled, false);
    const html = await fs.readFile(htmlExportPath, 'utf8');
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /PostMeter Performance Results/);
    assert.match(html, /Charts and Trends/);
    assert.match(html, /Response Details/);
    assert.match(html, /id="resultPageSizeSelect"/);
    assert.match(html, /id="resultStatusFilterSelect"/);
    assert.match(html, /View Details/);
    assert.match(html, /id="responseDetailModal"/);
    assert.doesNotMatch(html, /<section id="responses"/);
    assert.doesNotMatch(html, /Appendix|Raw Run Data/);
    assert.match(html, /Endpoint Diagnosis/);
    assert.match(html, /Diagnostic Checks/);
    assert.match(html, /Diagnosis phases/);
    assert.match(html, /\/diagnostic\?api_key=demo/);
    assert.match(html, /Body SHA-256/);

    const compactHtmlExported = await handlers.get('performance:exportResult')({}, result, 'html', {
      includeRequestResults: false,
      includeRequestDetails: true
    });
    assert.equal(compactHtmlExported.cancelled, false);
    const compactHtml = await fs.readFile(compactHtmlExportPath, 'utf8');
    assert.match(compactHtml, /PostMeter Performance Results/);
    assert.match(compactHtml, /Endpoint Diagnosis/);
    assert.match(compactHtml, /Diagnostic Checks/);
    assert.match(compactHtml, /Diagnosis phases/);
    assert.doesNotMatch(compactHtml, /Request Results/);
    assert.doesNotMatch(compactHtml, /View Details/);
    assert.doesNotMatch(compactHtml, /id="responseDetailModal"/);
    assert.match(compactHtml, /\/diagnostic\?api_key=demo/);
  } finally {
    controller?.closeResultStore?.();
    await server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime IPC runs full endpoint diagnosis against live google.com through SQLite results', async () => {
  const handlers = new Map();
  const progressMessages = [];
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-runtime-google-diagnosis-'));
  const resultStorePath = path.join(tempDir, 'current.sqlite');
  const workspace = {
    cookies: [],
    globals: [],
    settings: { sandbox: { fileBindings: [], packageCache: [], trustedCapabilities: {} } },
    environments: []
  };
  let controller;
  try {
    controller = registerRuntimeIpc({
      dialog: { showSaveDialog: async () => ({ canceled: true }) },
      fileOperationResult: (result) => result,
      getMainWindow: () => null,
      getWorkspace: () => workspace,
      getWorkspaceId: () => 'workspace-google-diagnosis',
      ipcMain: {
        handle(channel, handler) {
          handlers.set(channel, handler);
        }
      },
      mutateWorkspace: async (mutator) => mutator(workspace),
      resultStorePath,
      saveWorkspace: async (nextWorkspace) => nextWorkspace,
      setWorkspace: () => {}
    });

    const performanceTest = defaultPerformanceTest({
      id: 'perf-google-diagnosis',
      name: 'Google Diagnosis',
      type: 'diagnosis',
      request: {
        id: 'request-google-diagnosis',
        name: 'Google',
        method: 'GET',
        url: 'https://google.com'
      },
      config: { diagnosisScope: 'quick', concurrency: 5, spikeMultiplier: 2 },
      safetyLimits: { maxTotalRequests: 44, maxConcurrency: 10, maxDurationSeconds: 60 }
    });

    const estimate = await handlers.get('performance:estimateResultStore')({}, performanceTest);
    assert.equal(estimate.plannedRequests, 44);
    assert.equal(estimate.canContinue, true);

    const result = await handlers.get('performance:start')({
      sender: {
        isDestroyed: () => false,
        send(channel, payload) {
          progressMessages.push({ channel, payload });
        }
      }
    }, 'performance-google-diagnosis-run', performanceTest, null);

    assert.equal(result.storeBacked, true);
    assert.equal(result.completedRequests, 44);
    assert.equal(result.totalRequests, 44);
    assert.equal(result.resultPage.totalAll, 44);
    assert.equal(result.summary.diagnosis.completedChecks, result.summary.diagnosis.requestedChecks);
    assert.equal(result.summary.diagnosis.completedChecks, 76);
    assert.ok(['high', 'medium', 'low'].includes(result.summary.diagnosis.confidence));
    assert.equal(progressMessages.at(-1).payload.progress.completedRequests, 44);

    const page = await handlers.get('performance:resultPage')({}, result.resultStoreId, { offset: 0, limit: 5, status: 'all' });
    assert.equal(page.totalAll, 44);
    assert.equal(page.items.length, 5);
    assert.deepEqual(page.items.map((item) => item.resultIndex), [0, 1, 2, 3, 4]);
    assert.ok(page.items.some((item) => Number(item.statusCode || 0) >= 200 && Number(item.statusCode || 0) < 400));

    const detail = await handlers.get('performance:resultDetail')({}, result.resultStoreId, 0);
    assert.equal(detail.requestId, 'request-google-diagnosis');
    assert.ok(Number(detail.statusCode || 0) >= 200 && Number(detail.statusCode || 0) < 400);
    assert.match(detail.finalUrl || detail.requestUrl, /^https:\/\/(www\.)?google\.com/);
    assert.ok(detail.timings && typeof detail.timings === 'object');
  } finally {
    await controller?.cleanupResultStore?.();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime IPC emits structured diagnostic events for collection run outcomes', async () => {
  const handlers = new Map();
  const events = [];
  const workspace = { cookies: [], globals: [], settings: { sandbox: { fileBindings: [], packageCache: [], trustedCapabilities: {} } } };
  registerRuntimeIpc({
    dialog: { showSaveDialog: async () => ({ canceled: true }) },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => workspace,
    getWorkspaceId: () => 'workspace-1',
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    mutateWorkspace: async (mutator) => mutator(workspace),
    recordDiagnosticEvent: async (event) => {
      events.push(event);
    },
    runCollection: async () => ({
      collectionId: 'collection-1',
      collectionName: 'Diagnostics',
      totalRequests: 1,
      passedRequests: 1,
      failedRequests: 0,
      passed: true,
      cancelled: false,
      results: []
    }),
    saveWorkspace: async (nextWorkspace) => nextWorkspace,
    setWorkspace: () => {}
  });

  await handlers.get('runner:start')({ sender: { send() {} } }, 'runner-id', {
    id: 'collection-1',
    name: 'Diagnostics',
    requests: [{ id: 'request-1', name: 'Request', url: 'https://api.example.test' }],
    folders: []
  }, { id: 'env', name: 'Env', variables: [] }, {
    stopOnFailure: false
  });

  assert.deepEqual(events.map((event) => event.type), [
    'runner.start.completed'
  ]);
  assert.equal(events[0].fields.requestCount, 1);
});

test('runtime IPC emits sanitized failed diagnostic events for collection run failures', async () => {
  const handlers = new Map();
  const events = [];
  const workspace = { cookies: [], globals: [], settings: { sandbox: { fileBindings: [], packageCache: [], trustedCapabilities: {} } } };
  registerRuntimeIpc({
    dialog: { showSaveDialog: async () => ({ canceled: true }) },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => workspace,
    getWorkspaceId: () => 'workspace-1',
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    mutateWorkspace: async (mutator) => mutator(workspace),
    recordDiagnosticEvent: async (event) => {
      events.push(sanitizeDiagnosticEvent(event, defaultDiagnosticsSettings()));
    },
    runCollection: async () => {
      throw new Error('runner failed /srv/customer.json Authorization: Bearer runner-token body=runner-body https://api.example.test/run?token=url-token');
    },
    saveWorkspace: async (nextWorkspace) => nextWorkspace,
    setWorkspace: () => {}
  });

  await assert.rejects(
    () => handlers.get('runner:start')({ sender: { send() {} } }, 'runner-failed', {
      id: 'collection-1',
      name: 'Diagnostics',
      requests: [{ id: 'request-1', name: 'Request', url: 'https://api.example.test' }],
      folders: []
    }, { id: 'env', name: 'Env', variables: [] }, {
      stopOnFailure: false
    }),
    /runner failed/
  );

  assert.deepEqual(events.map((event) => event.type), [
    'runner.start.failed'
  ]);
  assert.equal(events[0].failureCode, 'runner_start_failed');
  const serialized = JSON.stringify(events);
  assert.doesNotMatch(serialized, /runner-token|url-token|runner-body|\/srv\/customer|api\.example\.test/);
  assert.match(serialized, /\[path\]/);
  assert.match(serialized, /\[redacted/);
});

test('runtime IPC validates collection-run results before mutating workspace state', async () => {
  const handlers = new Map();
  const workspace = { cookies: [], globals: [], settings: {} };
  let mutationCalls = 0;

  registerRuntimeIpc({
    dialog: { showSaveDialog: async () => ({ canceled: true }) },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => workspace,
    getWorkspaceId: () => 'workspace-1',
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    mutateWorkspace: async (mutator) => {
      mutationCalls += 1;
      return mutator(workspace);
    },
    runCollection: async () => ({
      collectionId: 'collection-1',
      collectionName: 'Collection',
      totalRequests: 0,
      passedRequests: 0,
      failedRequests: 0,
      passed: true,
      cancelled: false,
      results: [],
      accessToken: 'leaked-token',
      environment: { id: 'runtime', name: 'Runtime', variables: [] },
      collectionVariables: [],
      globals: [],
      cookies: []
    }),
    saveWorkspace: async (nextWorkspace) => nextWorkspace,
    setWorkspace: () => {}
  });

  await assert.rejects(
    () => handlers.get('runner:start')({
      sender: { send() {} }
    }, 'invalid-runner-result', {
      id: 'collection-1',
      name: 'Collection',
      variables: [],
      requests: [],
      folders: []
    }, null, {}),
    /result.accessToken is not allowed in public IPC payloads/
  );
  assert.equal(mutationCalls, 0);
  assert.deepEqual(workspace.cookies, []);
});

test('runtime IPC rejects invalid workspace-owned runner payloads before execution', async () => {
  const handlers = new Map();
  let runCalls = 0;

  registerRuntimeIpc({
    dialog: { showSaveDialog: async () => ({ canceled: true }) },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => ({ cookies: [], globals: [], settings: {} }),
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    runRunner: async () => {
      runCalls += 1;
      return {};
    },
    saveWorkspace: async (nextWorkspace) => nextWorkspace,
    setWorkspace: () => {}
  });

  await assert.rejects(
    () => handlers.get('runner:start')({ sender: { send() {} } }, 'invalid-runner-payload', {
      id: 'runner-1',
      name: 'Runner',
      environmentId: 'none',
      allowEnvironmentMutation: false,
      requests: 'bad'
    }, null, {}),
    /runner.requests must be an array/
  );
  assert.equal(runCalls, 0);
});

test('runtime IPC only persists workspace-owned runner environment mutations when allowed', async () => {
  const handlers = new Map();
  const workspace = {
    cookies: [],
    globals: [],
    environments: [{ id: 'env', name: 'Env', variables: [{ enabled: true, key: 'token', value: 'base' }] }],
    settings: { sandbox: { fileBindings: [], packageCache: [], trustedCapabilities: {} } }
  };
  registerRuntimeIpc({
    dialog: { showSaveDialog: async () => ({ canceled: true }) },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => workspace,
    getWorkspaceId: () => 'workspace-1',
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    mutateWorkspace: async (mutator) => mutator(workspace),
    runRunner: async (runner, environment) => {
      const mutatedEnvironment = {
        ...(environment || { id: 'runtime', name: 'Runtime' }),
        variables: [{ enabled: true, key: 'token', value: runner.allowEnvironmentMutation ? 'persisted' : 'temporary' }]
      };
      return {
        runnerId: runner.id,
        runnerName: runner.name,
        runnerEnvironmentId: runner.environmentId,
        environmentMutationAllowed: runner.allowEnvironmentMutation === true,
        mutatedEnvironment: runner.allowEnvironmentMutation === true ? mutatedEnvironment : undefined,
        collectionId: '',
        collectionName: runner.name,
        totalRequests: 1,
        passedRequests: 1,
        failedRequests: 0,
        passed: true,
        cancelled: false,
        results: [],
        environment: mutatedEnvironment,
        cookies: []
      };
    },
    saveWorkspace: async (nextWorkspace) => nextWorkspace,
    setWorkspace: () => {}
  });

  const runner = {
    id: 'runner-1',
    name: 'Runner',
    environmentId: 'env',
    allowEnvironmentMutation: false,
    stopOnFailure: false,
    requests: [{ id: 'runner-request-1', name: 'Request', method: 'GET', url: 'https://example.test' }]
  };
  const event = { sender: { send() {} } };

  const temporaryResult = await handlers.get('runner:start')(event, 'runner-temp', runner, workspace.environments[0], {});
  assert.equal(temporaryResult.environment.variables[0].value, 'temporary');
  assert.equal(workspace.environments[0].variables[0].value, 'base');

  const persistedResult = await handlers.get('runner:start')(event, 'runner-persist', {
    ...runner,
    allowEnvironmentMutation: true
  }, workspace.environments[0], {});
  assert.equal(persistedResult.mutatedEnvironment.variables[0].value, 'persisted');
  assert.equal(workspace.environments[0].variables[0].value, 'persisted');
});

test('runtime IPC treats collection-run progress delivery failures as recoverable run failures', async () => {
  const handlers = new Map();
  const workspace = { cookies: [], globals: [], settings: {} };
  const server = await createServer((_request, response) => {
    response.statusCode = 200;
    response.end('ok');
  });

  try {
    registerRuntimeIpc({
      dialog: { showSaveDialog: async () => ({ canceled: true }) },
      fileOperationResult: (result) => result,
      getMainWindow: () => null,
      getWorkspace: () => workspace,
      ipcMain: {
        handle(channel, handler) {
          handlers.set(channel, handler);
        }
      },
      mutateWorkspace: async (mutator) => mutator(workspace),
      saveWorkspace: async (nextWorkspace) => nextWorkspace,
      setWorkspace: () => {}
    });

    await assert.rejects(
      () => handlers.get('runner:start')({
        sender: {
          send() {
            throw new Error('sender unavailable');
          }
        }
      }, 'progress-failure-runner-id', {
        id: 'collection-1',
        name: 'Progress Failure Collection',
        variables: [],
        folders: [],
        requests: [{
          id: 'request-1',
          name: 'Request',
          method: 'GET',
          url: `${server.baseUrl}/run`,
          queryParams: [],
          headers: [],
          bodyType: 'NONE',
          body: '',
          auth: { type: 'none' },
          scripts: { preRequest: '', tests: '' },
          variables: [],
          cookieJar: { enabled: false, storeResponses: false }
        }]
      }, null, {
        stopOnFailure: false
      }),
      /Collection-run progress delivery failed: sender unavailable/
    );
    assert.equal(await handlers.get('runner:cancel')(null, 'progress-failure-runner-id'), false);
  } finally {
    await server.close();
  }
});

test('runtime IPC persists refreshed OAuth auth without returning or exporting raw auth payloads', async () => {
  const handlers = new Map();
  const workspace = {
    cookies: [],
    collections: [{
      id: 'collection-1',
      name: 'Runtime OAuth',
      variables: [],
      folders: [],
      requests: [{
        id: 'oauth-request',
        name: 'OAuth Request',
        method: 'GET',
        url: '',
        queryParams: [],
        headers: [],
        bodyType: 'NONE',
        body: '',
        auth: {
          type: 'oauth2',
          grantType: 'authorizationCode',
          accessToken: 'stale-runtime-token',
          refreshToken: 'runtime-refresh',
          tokenUrl: '',
          expiresAt: '2000-01-01T00:00:00.000Z'
        }
      }]
    }]
  };
  let savedWorkspace = null;
  const server = await createServer(async (request, response) => {
    if (request.url === '/token') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        access_token: 'fresh-runtime-token',
        refresh_token: 'rotated-runtime-refresh',
        token_type: 'Bearer',
        expires_in: 600
      }));
      return;
    }
    response.statusCode = 200;
    response.end('ok');
  });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-runtime-ipc-'));
  try {
    workspace.collections[0].requests[0].url = `${server.baseUrl}/resource`;
    workspace.collections[0].requests[0].auth.tokenUrl = `${server.baseUrl}/token`;
    const runnerHtmlExportPath = path.join(tempDir, 'runner-result.html');
    const runnerCompactHtmlExportPath = path.join(tempDir, 'runner-result-compact.html');
    const runnerExportPath = path.join(tempDir, 'runner-result.json');
    const exportPaths = [runnerHtmlExportPath, runnerCompactHtmlExportPath, runnerExportPath];
    registerRuntimeIpc({
      dialog: { showSaveDialog: async () => ({ filePath: exportPaths.shift(), canceled: false }) },
      fileOperationResult: (result) => result,
      getMainWindow: () => null,
      getWorkspace: () => workspace,
      getWorkspaceId: () => 'workspace-1',
      ipcMain: {
        handle(channel, handler) {
          handlers.set(channel, handler);
        }
      },
      mutateWorkspace: async (mutator) => {
        const next = await mutator(workspace);
        savedWorkspace = structuredClone(next);
        return next;
      },
      saveWorkspace: async (nextWorkspace) => nextWorkspace,
      setWorkspace: () => {}
    });

    const result = await handlers.get('runner:start')({
      sender: { send() {} }
    }, 'runner-id', workspace.collections[0], null, { stopOnFailure: false });

    assert.equal(result.updatedAuth, undefined);
    assert.equal(JSON.stringify(result).includes('fresh-runtime-token'), false);
    assert.equal(JSON.stringify(result).includes('rotated-runtime-refresh'), false);
    assert.equal(savedWorkspace.collections[0].requests[0].auth.accessToken, 'fresh-runtime-token');
    assert.equal(savedWorkspace.collections[0].requests[0].auth.refreshToken, 'rotated-runtime-refresh');

    const exportedHtml = await handlers.get('runner:export')(null, result, 'html');
    assert.equal(exportedHtml.cancelled, false);
    const runnerHtmlExport = await fs.readFile(runnerHtmlExportPath, 'utf8');
    assert.match(runnerHtmlExport, /<!doctype html>/i);
    assert.match(runnerHtmlExport, /PostMeter Runner Results/);
    assert.match(runnerHtmlExport, /Charts and Trends/);
    assert.match(runnerHtmlExport, /Response Details/);
    assert.match(runnerHtmlExport, /id="resultPageSizeSelect"/);
    assert.match(runnerHtmlExport, /id="resultStatusFilterSelect"/);
    assert.match(runnerHtmlExport, /View Details/);
    assert.match(runnerHtmlExport, /id="responseDetailModal"/);
    assert.doesNotMatch(runnerHtmlExport, /<section id="responses"/);
    assert.doesNotMatch(runnerHtmlExport, /Appendix|Raw Run Data/);
    assert.match(runnerHtmlExport, /OAuth Request|Runtime OAuth/);
    assert.doesNotMatch(runnerHtmlExport, /fresh-runtime-token|rotated-runtime-refresh|stale-runtime-token|runtime-refresh/);

    const exportedCompactHtml = await handlers.get('runner:export')(null, result, 'html', {
      includeRequestResults: false,
      includeRequestDetails: true
    });
    assert.equal(exportedCompactHtml.cancelled, false);
    const runnerCompactHtmlExport = await fs.readFile(runnerCompactHtmlExportPath, 'utf8');
    assert.match(runnerCompactHtmlExport, /PostMeter Runner Results/);
    assert.doesNotMatch(runnerCompactHtmlExport, /Request Results/);
    assert.doesNotMatch(runnerCompactHtmlExport, /View Details/);
    assert.doesNotMatch(runnerCompactHtmlExport, /id="responseDetailModal"/);
    assert.doesNotMatch(runnerCompactHtmlExport, /OAuth Request/);

    await handlers.get('runner:export')(null, {
      collectionId: 'collection-1',
      collectionName: 'Runtime OAuth',
      totalRequests: 1,
      passedRequests: 1,
      failedRequests: 0,
      passed: true,
      results: [{
        requestId: 'oauth-request',
        requestName: 'OAuth Request',
        statusCode: 200,
        durationMillis: 1,
        passed: true,
        updatedAuth: {
          type: 'oauth2',
          grantType: 'authorizationCode',
          accessToken: 'exported-runner-token',
          refreshToken: 'exported-runner-refresh'
        }
      }]
    }, 'json');
    const runnerExport = await fs.readFile(runnerExportPath, 'utf8');
    assert.doesNotMatch(runnerExport, /exported-runner-token|exported-runner-refresh/);
  } finally {
    await server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime IPC rejects duplicate active collection-run ids without replacing the active controller', async () => {
  const handlers = new Map();
  const workspace = { cookies: [], globals: [], settings: {} };
  const server = await createServer((_request, response) => {
    setTimeout(() => {
      response.statusCode = 200;
      response.end('ok');
    }, 100);
  });
  try {
    registerRuntimeIpc({
      dialog: { showSaveDialog: async () => ({ canceled: true }) },
      fileOperationResult: (result) => result,
      getMainWindow: () => null,
      getWorkspace: () => workspace,
      ipcMain: {
        handle(channel, handler) {
          handlers.set(channel, handler);
        }
      },
      mutateWorkspace: async (mutator) => mutator(workspace),
      saveWorkspace: async (nextWorkspace) => nextWorkspace,
      setWorkspace: () => {}
    });
    const event = { sender: { send() {} } };
    const collection = {
      id: 'collection-1',
      name: 'Duplicate Run Collection',
      variables: [],
      folders: [],
      requests: [{
        id: 'request-1',
        name: 'Slow Request',
        method: 'GET',
        url: `${server.baseUrl}/run`,
        queryParams: [],
        headers: [],
        bodyType: 'NONE',
        body: '',
        auth: { type: 'none' },
        scripts: { preRequest: '', tests: '' },
        variables: [],
        cookieJar: { enabled: false, storeResponses: false }
      }]
    };
    const firstRun = handlers.get('runner:start')(event, 'duplicate-runner-id', collection, null, {
      stopOnFailure: false
    });

    await assert.rejects(
      () => handlers.get('runner:start')(event, 'duplicate-runner-id', collection, null, { stopOnFailure: false }),
      /already running/
    );
    assert.equal(await handlers.get('runner:cancel')(null, 'duplicate-runner-id'), true);
    await firstRun.catch(() => null);
    assert.equal(await handlers.get('runner:cancel')(null, 'duplicate-runner-id'), false);
  } finally {
    await server.close();
  }
});

async function createServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}
