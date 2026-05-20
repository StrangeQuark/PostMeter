const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runCollection } = require('../../src/core/runtime/collectionRunner');
const { importPostmanCollection } = require('../../src/core/import-export/postmanImporter');
const {
  prepareGraphqlHttpRequest,
  runScriptedRequestLifecycle,
  createScriptedRequestState
} = require('../../src/core/runtime/scriptedRequestLifecycle');

const fixturePath = path.join(__dirname, '../fixtures/postman/protocol-script-hooks.collection.json');

function protocolFixture() {
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

test('executes imported GraphQL and gRPC protocol script hooks through the sandbox lifecycle', async () => {
  const collection = importPostmanCollection(protocolFixture());
  const sentHttpRequests = [];
  const invokedGrpcRequests = [];
  const environment = {
    id: 'env',
    name: 'Env',
    variables: [
      { enabled: true, key: 'userId', value: 'user-42' },
      { enabled: true, key: 'token', value: 'protocol-token' }
    ]
  };

  const result = await runCollection(collection, environment, {
    sendRequest: async (request, runtimeEnv) => {
      sentHttpRequests.push({ request, runtimeEnv });
      const payload = JSON.parse(request.body);
      assert.equal(request.protocol, 'graphql');
      assert.equal(request.method, 'POST');
      assert.equal(request.headers.find((header) => header.key === 'X-GraphQL-Before')?.value, 'beforeQuery');
      assert.equal(request.headers.find((header) => header.key.toLowerCase() === 'content-type')?.value, 'application/json');
      assert.equal(payload.operationName, 'GetUser');
      assert.equal(payload.variables.id, 'user-42');
      assert.equal(runtimeEnv.variables.find((variable) => variable.key === 'baseUrl')?.value, 'https://api.example.test');
      return {
        statusCode: 200,
        headers: { 'content-type': ['application/json'] },
        body: '{"data":{"user":{"id":"user-42","name":"Ada"}}}',
        durationMillis: 8,
        responseBytes: 45,
        finalUrl: 'https://api.example.test/graphql'
      };
    },
    grpcInvoker: async (request, runtimeEnv) => {
      invokedGrpcRequests.push({ request, runtimeEnv });
      assert.equal(request.protocol, 'grpc');
      assert.equal(request.methodPath, 'users.UserService/GetUser');
      assert.equal(request.grpc.methodType, 'server-streaming');
      assert.equal(request.metadata.find((item) => item.key === 'authorization')?.value, 'Bearer protocol-token');
      assert.equal(request.messages.some((message) => message.name === 'lookup'), true);
      assert.equal(runtimeEnv.variables.find((variable) => variable.key === 'userId')?.value, 'user-42');
      return {
        response: {
          code: 0,
          status: 'OK',
          metadata: [{ key: 'grpc-status', value: '0' }],
          trailers: [{ key: 'grpc-message', value: 'done' }],
          messages: [{
            name: 'user',
            data: { id: 'user-42', name: 'Ada' },
            timestamp: '2026-04-27T00:00:00.000Z'
          }],
          durationMillis: 5,
          finalUrl: 'grpc://grpc.example.test:443/users.UserService/GetUser'
        }
      };
    }
  });

  assert.equal(result.passed, true);
  assert.equal(sentHttpRequests.length, 1);
  assert.equal(invokedGrpcRequests.length, 1);
  assert.equal(result.results[0].preRequestScriptResult.tests.length, 0);
  assert.equal(result.results[0].testScriptResult.tests[0].name, 'graphql after response event');
  assert.equal(result.results[1].preRequestScriptResult.passed, true);
  assert.equal(result.results[1].messageScriptResults[0].tests[0].name, 'grpc on message event');
  assert.equal(result.results[1].afterResponseScriptResult.tests[0].name, 'grpc after response event');
  assert.equal(result.environment.variables.find((variable) => variable.key === 'graphqlBefore')?.value, 'beforeQuery');
  assert.equal(result.environment.variables.find((variable) => variable.key === 'graphqlAfter')?.value, 'user-42');
  assert.equal(result.environment.variables.find((variable) => variable.key === 'grpcBefore')?.value, 'beforeInvoke');
  assert.equal(result.environment.variables.find((variable) => variable.key === 'grpcMessage')?.value, 'Ada');
  assert.equal(result.environment.variables.find((variable) => variable.key === 'grpcAfter')?.value, 'OK');
});

test('prepares GraphQL Postman body imports as brokered HTTP JSON requests', () => {
  const request = importPostmanCollection(protocolFixture()).requests[0];
  const prepared = prepareGraphqlHttpRequest(request);
  const payload = JSON.parse(prepared.body);

  assert.equal(prepared.protocol, 'graphql');
  assert.equal(prepared.bodyType, 'RAW_JSON');
  assert.equal(prepared.headers.find((header) => header.key.toLowerCase() === 'content-type')?.value, 'application/json');
  assert.equal(payload.query, 'query GetUser($id: ID!) { user(id: $id) { id name } }');
  assert.deepEqual(payload.variables, { id: '{{userId}}' });
  assert.equal(payload.operationName, 'GetUser');
});

test('normalizes GraphQL subscription-style responses into pm.response.messages', async () => {
  const collection = importPostmanCollection({
    info: {
      name: 'GraphQL Subscription Messages',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: [{
      name: 'GraphQL subscription',
      protocol: 'graphql',
      event: [{
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: [
            "pm.test('subscription messages are available', function () {",
            "  pm.expect(pm.info.eventName).to.equal('afterResponse');",
            "  pm.expect(pm.response.messages.count()).to.equal(2);",
            "  pm.response.messages.to.include({ data: { event: 'created' } });",
            "  pm.response.messages.to.have.property('data.id', 'evt-2');",
            "  pm.response.messages.to.have.jsonSchema({ type: 'object', required: ['data'], properties: { data: { type: 'object' } } });",
            "  pm.expect(pm.response.messages.filter({ data: { event: 'updated' } }).length).to.equal(1);",
            "});"
          ]
        }
      }],
      request: {
        method: 'POST',
        url: 'https://api.example.test/graphql',
        body: {
          mode: 'graphql',
          graphql: {
            query: 'subscription Events { events { id event } }',
            variables: '{}',
            operationName: 'Events'
          }
        }
      }
    }]
  });
  const state = createScriptedRequestState(collection.requests[0], null);

  const result = await runScriptedRequestLifecycle(state, {
    sendRequest: async () => ({
      statusCode: 200,
      headers: { 'content-type': ['text/event-stream'] },
      body: [
        'event: next',
        'data: {"data":{"id":"evt-1","event":"created"}}',
        '',
        'event: next',
        'data: {"data":{"id":"evt-2","event":"updated"}}',
        '',
        'event: complete',
        'data: [DONE]',
        ''
      ].join('\n'),
      durationMillis: 7,
      responseBytes: 120,
      finalUrl: 'https://api.example.test/graphql'
    })
  });

  assert.equal(result.testScriptResult.passed, true);
  assert.equal(result.response.messages.length, 2);
  assert.deepEqual(result.response.messages.map((message) => message.data.id), ['evt-1', 'evt-2']);
});

test('rejects imported WebSocket protocol script execution instead of inventing unsupported hooks', async () => {
  await assert.rejects(
    () => runScriptedRequestLifecycle(
      createScriptedRequestState({
        id: 'ws',
        name: 'WebSocket',
        protocol: 'websocket',
        url: 'wss://socket.example.test',
        scripts: { preRequest: 'pm.test("not run", function () {});' }
      }, null),
      { sendRequest: async () => ({ statusCode: 200, body: '' }) }
    ),
    /WebSocket and Socket\.IO requests do not currently expose documented script hooks/
  );
});
