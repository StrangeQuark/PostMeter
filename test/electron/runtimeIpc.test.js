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
    'performance:export',
    'performance:exportResult',
    'performance:import',
    'performance:start',
    'runner:cancel',
    'runner:export',
    'runner:start'
  ]);
  assert.equal(await handlers.get('runner:cancel')(null, 'runner-id'), false);
  assert.equal(await handlers.get('performance:calibrate:cancel')(null, 'calibration-id'), false);
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
          assertions: [],
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
    const runnerExportPath = path.join(tempDir, 'runner-result.json');
    const exportPaths = [runnerExportPath];
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
        assertions: [],
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
