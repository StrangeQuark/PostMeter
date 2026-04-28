const assert = require('node:assert/strict');
const test = require('node:test');
const { collectionModel, requestModel } = require('../../src/core/models');
const { MockStateStore, handleLocalMockRequest } = require('../../src/core/localMockServer');
const { runPostmanScript, scriptPackageIntegrity } = require('../../src/core/scriptRuntime');
const { runPostmanScriptIsolated } = require('../../src/core/scriptSandbox');
const {
  createScriptedRequestState,
  runScriptedRequestLifecycle
} = require('../../src/core/scriptedRequestLifecycle');

test('blocks prototype and constructor escapes from script-visible objects', async () => {
  const execution = await runPostmanScriptIsolated(`
    pm.test('constructor and prototype escapes stay blocked', async function () {
      const attempts = [
        function () { return Function('return process')().cwd(); },
        function () { return ({}).constructor.constructor('return process')().cwd(); },
        function () { return pm.test.constructor.constructor('return process')(); },
        function () { return pm.expect(1).constructor.constructor('return process')(); },
        function () { return Promise.resolve(1).constructor.constructor('return process')().cwd(); }
      ];
      for (const attempt of attempts) {
        let escaped = false;
        try {
          attempt();
          escaped = true;
        } catch (_) {}
        pm.expect(escaped).to.equal(false);
      }
      const headers = pm.request.headers.toObject();
      pm.expect(headers.constructor).to.be.undefined;
      pm.expect(Object.prototype.polluted).to.be.undefined;
    });
  `, {
    request: {
      method: 'GET',
      url: 'https://api.example.test/escape',
      headers: [{ key: 'X-Test', value: 'yes' }]
    }
  }, {
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(execution.result.passed, true);
});

test('keeps dynamic code generation inside the VM while blocking host escapes and WebAssembly', () => {
  const result = runPostmanScript(`
    pm.test('dynamic code remains sandboxed', function () {
      let processEscaped = false;
      try {
        Function('return process.cwd()')();
        processEscaped = true;
      } catch (_) {}
      let evalEscaped = false;
      let evalValue = 0;
      try {
        evalValue = eval('1 + 1');
        eval('process.cwd()');
        evalEscaped = true;
      } catch (_) {}
      let indirectEvalEscaped = false;
      try {
        (0, eval)('process.cwd()');
        indirectEvalEscaped = true;
      } catch (_) {}
      let constructorEscaped = false;
      try {
        ({}).constructor.constructor('return process.cwd()')();
        constructorEscaped = true;
      } catch (_) {
      }
      let wasmBlocked = false;
      try {
        new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
      } catch (_) {
        wasmBlocked = true;
      }
      pm.expect(Function('return 2 + 2')()).to.equal(4);
      pm.expect(evalValue).to.equal(2);
      pm.expect(processEscaped).to.equal(false);
      pm.expect(evalEscaped).to.equal(false);
      pm.expect(indirectEvalEscaped).to.equal(false);
      pm.expect(constructorEscaped).to.equal(false);
      pm.expect(wasmBlocked).to.equal(true);
    });
  `);

  assert.equal(result.passed, true);
});

test('rejects package-loader abuse without loading host Node modules or unreviewed packages', () => {
  const hostFs = runPostmanScript("require('node:fs');");
  const hostChildProcess = runPostmanScript("require('child_process');");
  const pathTraversal = runPostmanScript("require('../../package.json');");
  const unreviewedPackage = runPostmanScript("pm.require('npm:@scope/evil@1.0.0');");
  const duplicateBuiltIn = runPostmanScript("pm.test('noop', function () {});", {
    sandboxPackages: [{
      specifier: 'lodash',
      source: 'module.exports = {};',
      integrity: scriptPackageIntegrity('module.exports = {};')
    }]
  });
  const dependencyAliasOverflow = runPostmanScript("pm.test('noop', function () {});", {
    sandboxPackages: [{
      specifier: '@postmeter/too-many-aliases',
      source: 'module.exports = {};',
      integrity: scriptPackageIntegrity('module.exports = {};'),
      dependencyAliases: Object.fromEntries(Array.from({ length: 33 }, (_value, index) => [`alias${index}`, 'lodash']))
    }]
  });

  assert.match(hostFs.error, /only supports bundled sandbox packages/);
  assert.match(hostChildProcess.error, /is not available/);
  assert.match(pathTraversal.error, /only supports bundled sandbox packages/);
  assert.match(unreviewedPackage.error, /not installed in the reviewed package cache/);
  assert.match(duplicateBuiltIn.error, /specifier "lodash" is invalid/);
  assert.match(dependencyAliasOverflow.error, /dependency aliases cannot exceed/);
});

test('normalizes broker payloads without prototype pollution or parent mutation', async () => {
  let observedRequest = null;
  const execution = await runPostmanScriptIsolated(`
    pm.test('broker payload is normalized', async function () {
      const headers = JSON.parse('{"__proto__":{"polluted":"yes"},"constructor":"bad","X-Ok":"yes"}');
      const response = await pm.sendRequest({
        method: 'POST',
        url: 'https://api.example.test/broker',
        header: headers,
        body: { mode: 'raw', raw: '{"ok":true}', options: { raw: { language: 'json' } } }
      });
      pm.expect(response.code).to.equal(200);
      pm.expect(Object.prototype.polluted).to.be.undefined;
    });
  `, {}, {
    sendRequest: async (request) => {
      observedRequest = request;
      assert.equal(Object.prototype.polluted, undefined);
      return jsonResponse(200, { ok: true });
    },
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(execution.result.passed, true);
  assert.equal(observedRequest.headers.some((header) => header.key === 'X-Ok' && header.value === 'yes'), true);
  assert.equal(Object.prototype.polluted, undefined);
});

test('blocks raw networking, filesystem, process, and shell access in isolated workers', async () => {
  const execution = await runPostmanScriptIsolated(`
    pm.test('host primitives are unavailable', function () {
      const probes = [
        function () { return fetch('https://example.test'); },
        function () { return new XMLHttpRequest(); },
        function () { return new WebSocket('wss://example.test'); },
        function () { return process.cwd(); },
        function () { return require('node:fs'); },
        function () { return require('child_process'); }
      ];
      for (const probe of probes) {
        let blocked = false;
        try {
          probe();
        } catch (_) {
          blocked = true;
        }
        pm.expect(blocked).to.equal(true);
      }
    });
  `, {}, {
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(execution.result.passed, true);
});

test('treats hostile visualizer documents as isolated render data and rejects unreviewed assets', () => {
  const result = runPostmanScript(`
    const data = JSON.parse('{"constructor":{"constructor":"bad"},"safe":"ok"}');
    pm.visualizer.set('<section onclick="evil()"><img src="https://evil.example/pixel"><iframe src="file:///etc/passwd"></iframe><p>{{safe}}/{{constructor.constructor}}</p><script>window.top.require("fs")</script></section>', data);
  `);
  const rejectedAsset = runPostmanScript(`
    pm.visualizer.set('<p>asset</p>', {}, {
      assets: [{ name: 'evil', type: 'script', source: 'fetch("https://evil.example")', integrity: 'sha256-bad' }]
    });
  `);

  assert.equal(result.passed, true);
  assert.equal(result.visualizer.interactive, true);
  assert.match(result.visualizer.html, /<script>window\.top\.require\("fs"\)<\/script>/);
  assert.equal(result.visualizer.html.includes('onclick='), false);
  assert.equal(result.visualizer.html.includes('https://evil.example'), false);
  assert.equal(result.visualizer.html.includes('file:///etc/passwd'), false);
  assert.equal(result.visualizer.html.includes('bad'), false);
  assert.equal(rejectedAsset.passed, false);
  assert.match(rejectedAsset.error, /integrity does not match/);
});

test('rolls back hostile mock-state mutations and prevents prototype pollution', async () => {
  const store = new MockStateStore({ stable: 'yes' });
  const collection = collectionModel({
    requests: [requestModel({
      id: 'mock-adversarial',
      method: 'GET',
      url: '/mock-adversarial',
      scripts: {
        mock: `
          await pm.state.set('__proto__', { polluted: true });
          await pm.state.set('constructor', { bad: true });
          await pm.state.set('safe', 'should rollback');
          throw new Error('rollback hostile state');
        `
      }
    })]
  });

  const result = await handleLocalMockRequest(collection, {
    method: 'GET',
    url: 'http://localhost/mock-adversarial'
  }, {
    requireNodePermission: false,
    stateStore: store,
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(result.response.statusCode, 500);
  assert.match(result.response.body, /rollback hostile state/);
  assert.deepEqual(store.snapshot(), { stable: 'yes' });
  assert.equal(Object.prototype.polluted, undefined);
});

test('bounds gRPC protocol message floods before dispatching per-message scripts', async () => {
  const request = requestModel({
    id: 'grpc-flood',
    name: 'gRPC Flood',
    protocol: 'grpc',
    methodPath: 'flood.Service/Stream',
    url: 'grpcs://grpc.example.test/flood.Service/Stream',
    scripts: {
      onIncomingMessage: 'pm.test("message", function () {});',
      afterResponse: 'pm.test("after", function () {});'
    }
  });
  const seenMessages = [];
  const messages = Array.from({ length: 1105 }, (_value, index) => ({
    data: { index },
    name: `message-${index}`,
    timestamp: '2026-04-27T00:00:00.000Z'
  }));

  const result = await runScriptedRequestLifecycle(
    createScriptedRequestState(request, { id: 'env', name: 'Env', variables: [] }),
    {
      grpcInvoker: async () => ({ response: { code: 0, messages } }),
      scriptRunner: async (_scriptText, context) => {
        if (context.eventName === 'onIncomingMessage') {
          seenMessages.push(context.message.name);
        }
        return {
          result: { passed: true, tests: [], error: '', logs: [], commitSideEffects: true, execution: {} },
          environmentVariables: context.environment?.variables || [],
          collectionVariables: context.collectionVariables || [],
          globals: context.globals || [],
          localVariables: context.localVariables || [],
          cookies: context.cookieJar || [],
          request: context.request || {}
        };
      }
    }
  );

  assert.equal(result.response.messages.length, 1000);
  assert.equal(seenMessages.length, 1000);
  assert.equal(seenMessages.at(-1), 'message-999');
});

test('fails closed on oversized worker output without committing side effects', async () => {
  const execution = await runPostmanScriptIsolated(`
    pm.environment.set('huge', 'x'.repeat(2 * 1024 * 1024));
  `, {
    environment: { id: 'env', name: 'Env', variables: [{ enabled: true, key: 'stable', value: 'yes' }] }
  }, {
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(execution.result.passed, false);
  assert.match(execution.result.error, /result exceeded the maximum allowed size|result payload is invalid|maximum allowed size/);
  assert.equal(execution.environmentVariables.find((variable) => variable.key === 'huge'), undefined);
  assert.equal(execution.environmentVariables.find((variable) => variable.key === 'stable').value, 'yes');
});

test('terminates infinite async work without committing earlier mutations', async () => {
  const execution = await runPostmanScriptIsolated(`
    pm.environment.set('beforeHang', 'yes');
    pm.test('never finishes', function (done) {});
  `, {
    environment: { id: 'env', name: 'Env', variables: [] }
  }, {
    timeoutMillis: 50,
    workerTimeoutMillis: 500
  });

  assert.equal(execution.result.passed, false);
  assert.match(execution.result.error, /async work timed out|worker timed out|exited before returning/i);
  assert.equal(execution.environmentVariables.find((variable) => variable.key === 'beforeHang'), undefined);
});

function jsonResponse(statusCode, body) {
  const text = JSON.stringify(body);
  return {
    statusCode,
    headers: { 'content-type': ['application/json'] },
    body: text,
    durationMillis: 1,
    responseBytes: Buffer.byteLength(text),
    finalUrl: 'https://api.example.test/broker'
  };
}
