const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { runCollection } = require('../../src/core/collectionRunner');
const { importPostmanCollection } = require('../../src/core/postmanImporter');
const { MemoryVaultStore } = require('../../src/core/vaultStore');

const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures', 'postman');

test('runs the golden Postman/Newman sandbox v1 corpus through the importer and collection runner', async () => {
  const collection = importPostmanCollection(await readFixture('newman-sandbox-v1.collection.json'));
  const iterationData = await readFixture('newman-sandbox-v1.iteration-data.json');
  const expected = await readFixture('newman-sandbox-v1.expected.json');
  const sentRequests = [];
  const brokeredSendRequestUrls = [];
  const vault = new MemoryVaultStore({ seededToken: 'seeded-value' });

  const result = await runCollection(collection, {
    id: 'env-golden',
    name: 'Golden Env',
    variables: [
      { enabled: true, key: 'shared', value: 'environment-shared' },
      { enabled: true, key: 'envOnly', value: 'environment-only' }
    ]
  }, {
    globals: [
      { enabled: true, key: 'shared', value: 'global-shared' },
      { enabled: true, key: 'globalOnly', value: 'global-only' }
    ],
    cookieJar: [
      { enabled: true, name: 'visible', value: 'visible-cookie', domain: 'api.example.test', path: '/', secure: false, httpOnly: false, sameSite: 'Lax', hostOnly: true },
      { enabled: true, name: 'secret', value: 'secret-cookie', domain: 'api.example.test', path: '/', secure: false, httpOnly: true, sameSite: 'Lax', hostOnly: true }
    ],
    iteration: 0,
    iterationCount: 1,
    iterationData,
    trustedCapabilities: { vault: true },
    vault,
    sendRequest: async (request, environment) => {
      if (!request.name) {
        brokeredSendRequestUrls.push(request.url);
        return brokeredResponse(request.url);
      }

      if (request.name === '05 Skipped By SetNextRequest' || request.name === '06 Skip By Prerequest') {
        throw new Error(`${request.name} should not have been sent.`);
      }

      sentRequests.push(request.name);
      if (request.name === '01 Setup And Variable Precedence') {
        assert.equal(headerValue(request.headers, 'X-Pre'), 'collection-only');
        assert.equal(envValue(environment, 'shared'), 'request-shared');
        return jsonResponse(200, { step: 'setup' });
      }
      if (request.name === '03 Iteration Data And Cookie Scope') {
        assert.equal(headerValue(request.headers, 'X-Row'), 'row-42');
        return jsonResponse(200, { step: 'cookies' });
      }
      if (request.name === '03c RunRequest Target') {
        assert.equal(envValue(environment, 'runRequestCaller'), 'yes');
        assert.equal(envValue(environment, 'runRequestPath'), 'run-request-target');
        return jsonResponse(202, { target: 'run-request-target' });
      }
      if (request.name === '08 Mixed Script Failure') {
        return jsonResponse(200, { state: 'mixed' });
      }
      return jsonResponse(200, { ok: true });
    }
  });

  assert.equal(collection.name, expected.name);
  assert.equal(result.passed, expected.summary.passed);
  assert.equal(result.cancelled, expected.summary.cancelled);
  assert.equal(result.totalRequests, expected.summary.totalRequests);
  assert.equal(result.passedRequests, expected.summary.passedRequests);
  assert.equal(result.failedRequests, expected.summary.failedRequests);
  assert.deepEqual(sentRequests, expected.sentRequests);
  assert.deepEqual(brokeredSendRequestUrls, expected.brokeredSendRequestUrls);
  assert.deepEqual(result.results.map((item) => item.requestName), expected.resultRequests);

  const resultsByName = new Map(result.results.map((item) => [item.requestName, item]));
  assert.equal(
    resultsByName.get('01 Setup And Variable Precedence').testScriptResult.visualizer.html,
    '<section><h1>Setup</h1><p>200</p></section>'
  );
  for (const requestName of expected.notSentRequests) {
    if (requestName === '06 Skip By Prerequest') {
      assert.equal(resultsByName.get(requestName).statusCode, 0);
      assert.equal(resultsByName.get(requestName).passed, true);
    } else {
      assert.equal(resultsByName.has(requestName), false);
    }
  }

  for (const [key, value] of Object.entries(expected.environment)) {
    assert.equal(envValue(result.environment, key), value);
  }
  for (const [key, value] of Object.entries(expected.collectionVariables)) {
    assert.equal(variableValue(result.collectionVariables, key), value);
  }

  const runRequestResult = resultsByName.get('03b Execution RunRequest');
  assert.ok(runRequestResult.testScriptResult.tests.some((item) => item.name === '03c RunRequest Target: runRequest target test is reported on caller' && item.passed));

  assert.equal(cookieValue(result.cookies, 'scripted'), expected.cookies.scripted);
  assert.equal(cookieValue(result.cookies, 'secret'), expected.cookies.secret);
  assert.equal(cookieValue(result.cookies, 'visible'), undefined);
  assert.equal(await vault.get('seededToken'), 'seeded-value');
  assert.equal(await vault.get('corpusToken'), undefined);

  const failedRequest = resultsByName.get(expected.failedTest.requestName);
  const failedTest = failedRequest.testScriptResult.tests.find((item) => item.name === expected.failedTest.testName);
  assert.equal(failedRequest.passed, false);
  assert.equal(failedTest.passed, false);
  assert.match(failedTest.error, /Expected mixed to equal expected/);
  assert.equal(envValue(result.environment, 'failureSideEffect'), 'committed');
});

test('cancels pending async work from the Postman/Newman sandbox corpus without committing late side effects', async () => {
  const collection = importPostmanCollection(await readFixture('newman-cancellation.collection.json'));
  const controller = new AbortController();
  let sends = 0;
  const run = runCollection(collection, {
    id: 'env-cancel',
    name: 'Cancel Env',
    variables: []
  }, {
    signal: controller.signal,
    scriptOptions: {
      timeoutMillis: 10000,
      workerTimeoutMillis: 10000
    },
    sendRequest: async () => {
      sends++;
      return jsonResponse(200, { shouldNotSend: true });
    }
  });

  const abortTimer = setTimeout(() => controller.abort(), 30);
  abortTimer.unref?.();
  const result = await run;

  assert.equal(sends, 0);
  assert.equal(result.cancelled, true);
  assert.equal(result.totalRequests, 1);
  assert.equal(result.failedRequests, 1);
  assert.match(result.results[0].error, /cancelled|exited before returning/i);
  assert.equal(envValue(result.environment, 'cancelledLateMutation'), undefined);
});

async function readFixture(fileName) {
  return JSON.parse(await fs.readFile(path.join(FIXTURE_DIR, fileName), 'utf8'));
}

function brokeredResponse(url) {
  if (url === 'https://api.example.test/aux/one') {
    return jsonResponse(200, { id: 'one' });
  }
  if (url === 'https://api.example.test/aux/two?source=one') {
    return jsonResponse(200, { source: 'one' });
  }
  throw new Error(`Unexpected brokered pm.sendRequest URL: ${url}`);
}

function jsonResponse(statusCode, body) {
  const text = JSON.stringify(body);
  return {
    statusCode,
    headers: { 'content-type': ['application/json'] },
    body: text,
    durationMillis: 12,
    responseBytes: Buffer.byteLength(text),
    finalUrl: 'https://api.example.test'
  };
}

function headerValue(headers, key) {
  const target = String(key || '').toLowerCase();
  return (headers || []).find((item) => String(item.key || '').toLowerCase() === target)?.value;
}

function envValue(environment, key) {
  return variableValue(environment?.variables || [], key);
}

function variableValue(variables, key) {
  return (variables || []).find((item) => item.enabled !== false && item.key === key)?.value;
}

function cookieValue(cookies, name) {
  return (cookies || []).find((item) => item.name === name)?.value;
}
