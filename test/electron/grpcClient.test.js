const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const {
  createScriptedRequestState,
  runScriptedRequestLifecycle
} = require('../../src/core/scriptedRequestLifecycle');

const TEST_PROTO = `
syntax = "proto3";
package postmeter.grpc;

message UserRequest {
  string id = 1;
  string name = 2;
}

message UserEvent {
  string id = 1;
  string name = 2;
  int32 sequence = 3;
}

service UserService {
  rpc GetUser(UserRequest) returns (UserEvent);
  rpc UploadUsers(stream UserRequest) returns (UserEvent);
  rpc WatchUsers(UserRequest) returns (stream UserEvent);
  rpc ChatUsers(stream UserRequest) returns (stream UserEvent);
  rpc Fails(UserRequest) returns (UserEvent);
}
`;

test('executes live unary gRPC requests through the default parent transport', async (t) => {
  const fixture = await startGrpcFixture(t);
  const result = await runScriptedRequestLifecycle(
    createScriptedRequestState(grpcRequest(fixture.port, 'GetUser', 'unary'), grpcEnvironment()),
    {}
  );

  assert.equal(result.requestSent, true);
  assert.equal(result.preRequestScriptResult.passed, true);
  assert.equal(result.testScriptResult.passed, true);
  assert.equal(result.response.code, 0);
  assert.equal(result.response.messages.length, 1);
  assert.equal(result.response.messages[0].data.name, 'Ada');
  assert.equal(result.environment.variables.find((item) => item.key === 'grpcAfterStatus')?.value, '0');
  assert.equal(fixture.observed.getAuthorization, 'Bearer protocol-token');
});

test('executes live client-streaming gRPC requests through the default parent transport', async (t) => {
  const fixture = await startGrpcFixture(t);
  const result = await runScriptedRequestLifecycle(
    createScriptedRequestState(grpcRequest(fixture.port, 'UploadUsers', 'client-streaming', [
      { name: 'seed', data: { id: 'seed-1', name: 'Seed' } }
    ]), grpcEnvironment()),
    {}
  );

  assert.equal(result.requestSent, true);
  assert.equal(result.testScriptResult.passed, true);
  assert.equal(result.response.code, 0);
  assert.equal(result.response.messages.length, 1);
  assert.equal(result.response.messages[0].data.sequence, 2);
  assert.deepEqual(fixture.observed.uploadedNames, ['Seed', 'Ada']);
});

test('executes live server-streaming gRPC requests and runs On message for each response', async (t) => {
  const fixture = await startGrpcFixture(t);
  const result = await runScriptedRequestLifecycle(
    createScriptedRequestState(grpcRequest(fixture.port, 'WatchUsers', 'server-streaming'), grpcEnvironment()),
    {}
  );

  assert.equal(result.requestSent, true);
  assert.equal(result.testScriptResult.passed, true);
  assert.equal(result.response.code, 0);
  assert.equal(result.response.messages.length, 2);
  assert.deepEqual(result.messageScriptResults.map((item) => item.tests[0].name), [
    'grpc on message 1',
    'grpc on message 2'
  ]);
  assert.equal(result.environment.variables.find((item) => item.key === 'grpcLastMessage')?.value, 'Ada Lovelace');
});

test('executes live bidirectional gRPC requests through the default parent transport', async (t) => {
  const fixture = await startGrpcFixture(t);
  const result = await runScriptedRequestLifecycle(
    createScriptedRequestState(grpcRequest(fixture.port, 'ChatUsers', 'bidirectional-streaming', [
      { name: 'seed', data: { id: 'seed-1', name: 'Seed' } }
    ]), grpcEnvironment()),
    {}
  );

  assert.equal(result.requestSent, true);
  assert.equal(result.testScriptResult.passed, true);
  assert.equal(result.response.code, 0);
  assert.equal(result.response.messages.length, 2);
  assert.deepEqual(result.response.messages.map((item) => item.data.name), ['Seed', 'Ada']);
  assert.deepEqual(fixture.observed.chatNames, ['Seed', 'Ada']);
});

test('normalizes live gRPC errors and still runs After response scripts', async (t) => {
  const fixture = await startGrpcFixture(t);
  const request = grpcRequest(fixture.port, 'Fails', 'unary', [], {
    afterResponse: `
      pm.test('after response sees grpc error', function () {
        pm.expect(pm.info.eventName).to.equal('afterResponse');
        pm.expect(pm.response.code).to.equal(14);
        pm.expect(pm.response.trailers.get('grpc-status')).to.equal('14');
      });
      pm.environment.set('grpcAfterError', pm.response.reason);
    `
  });
  const result = await runScriptedRequestLifecycle(
    createScriptedRequestState(request, grpcEnvironment()),
    {}
  );

  assert.equal(result.requestSent, true);
  assert.equal(result.afterResponseScriptResult.passed, true);
  assert.equal(result.testScriptResult.passed, true);
  assert.equal(result.response.code, 14);
  assert.match(result.environment.variables.find((item) => item.key === 'grpcAfterError')?.value || '', /downstream unavailable/);
});

test('uses trusted proto path interpolation from before Before invoke runs', async (t) => {
  const fixture = await startGrpcFixture(t);
  const protoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-grpc-path-'));
  const protoPath = path.join(protoDir, 'trusted.proto');
  await fs.writeFile(protoPath, TEST_PROTO, 'utf8');
  t.after(async () => {
    await fs.rm(protoDir, { recursive: true, force: true });
  });
  const request = grpcRequest(fixture.port, 'GetUser', 'unary', [], {
    beforeInvoke: `
      pm.environment.set('protoPath', '${jsString(path.join(protoDir, 'missing.proto'))}');
      pm.request.metadata.upsert({ key: 'authorization', value: 'Bearer ' + pm.variables.get('token') });
      pm.request.messages.add({ name: 'scripted', data: { id: pm.variables.get('userId'), name: pm.variables.get('userName') } });
    `
  });
  delete request.grpc.proto;
  request.grpc.protoPath = '{{protoPath}}';
  const environment = grpcEnvironment([
    { enabled: true, key: 'protoPath', value: protoPath }
  ]);
  const result = await runScriptedRequestLifecycle(
    createScriptedRequestState(request, environment),
    {}
  );

  assert.equal(result.requestSent, true);
  assert.equal(result.testScriptResult.passed, true);
  assert.equal(result.response.code, 0);
  assert.equal(result.response.messages[0].data.name, 'Ada');
});

async function startGrpcFixture(t) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-grpc-fixture-'));
  const protoPath = path.join(tmpDir, 'fixture.proto');
  await fs.writeFile(protoPath, TEST_PROTO, 'utf8');
  const packageDefinition = await protoLoader.load(protoPath, {
    defaults: true,
    enums: String,
    keepCase: true,
    longs: String,
    oneofs: true
  });
  const loaded = grpc.loadPackageDefinition(packageDefinition);
  const service = loaded.postmeter.grpc.UserService.service;
  const observed = {
    chatNames: [],
    getAuthorization: '',
    uploadedNames: []
  };
  const server = new grpc.Server();
  server.addService(service, {
    ChatUsers(call) {
      call.on('data', (request) => {
        observed.chatNames.push(request.name);
        call.write({ id: request.id, name: request.name, sequence: observed.chatNames.length });
      });
      call.on('end', () => {
        call.end();
      });
    },
    Fails(call, callback) {
      callback({
        code: grpc.status.UNAVAILABLE,
        details: 'downstream unavailable'
      });
    },
    GetUser(call, callback) {
      observed.getAuthorization = String(call.metadata.get('authorization')[0] || '');
      const metadata = new grpc.Metadata();
      metadata.set('x-initial', 'unary');
      call.sendMetadata(metadata);
      callback(null, {
        id: call.request.id,
        name: call.request.name,
        sequence: 1
      });
    },
    UploadUsers(call, callback) {
      const received = [];
      call.on('data', (request) => {
        received.push(request);
        observed.uploadedNames.push(request.name);
      });
      call.on('end', () => {
        callback(null, {
          id: 'upload',
          name: String(received.length),
          sequence: received.length
        });
      });
    },
    WatchUsers(call) {
      call.write({ id: call.request.id, name: call.request.name, sequence: 1 });
      call.write({ id: call.request.id, name: `${call.request.name} Lovelace`, sequence: 2 });
      call.end();
    }
  });
  const port = await bindGrpcServer(server);
  t.after(async () => {
    await new Promise((resolve) => {
      server.tryShutdown(() => resolve());
    });
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
  return { observed, port };
}

function bindGrpcServer(server) {
  return new Promise((resolve, reject) => {
    server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, port) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(port);
    });
  });
}

function grpcRequest(port, method, methodType, messages = [], scriptOverrides = {}) {
  return {
    id: `grpc-${method}`,
    methodPath: `postmeter.grpc.UserService/${method}`,
    messages,
    metadata: [],
    name: method,
    protocol: 'grpc',
    scripts: {
      beforeInvoke: `
        pm.request.metadata.upsert({ key: 'authorization', value: 'Bearer ' + pm.variables.get('token') });
        pm.request.messages.add({ name: 'scripted', data: { id: pm.variables.get('userId'), name: pm.variables.get('userName') } });
        pm.environment.set('grpcBeforeMethod', pm.request.methodPath);
      `,
      onIncomingMessage: `
        pm.test('grpc on message ' + pm.message.data.sequence, function () {
          pm.expect(pm.info.eventName).to.equal('onIncomingMessage');
          pm.expect(pm.message.data.id.length > 0).to.equal(true);
        });
        pm.environment.set('grpcLastMessage', pm.message.data.name);
      `,
      afterResponse: `
        pm.test('grpc after response', function () {
          pm.expect(pm.info.eventName).to.equal('afterResponse');
          pm.expect(pm.response.code).to.equal(0);
          pm.expect(pm.response.trailers.get('grpc-status')).to.equal('0');
          pm.expect(pm.response.messages.count() > 0).to.equal(true);
        });
        pm.environment.set('grpcAfterStatus', String(pm.response.code));
      `,
      ...scriptOverrides
    },
    url: `grpc://127.0.0.1:${port}`,
    grpc: {
      method,
      methodType,
      proto: TEST_PROTO,
      service: 'postmeter.grpc.UserService'
    }
  };
}

function grpcEnvironment(extraVariables = []) {
  return {
    id: 'grpc-env',
    name: 'gRPC Env',
    variables: [
      { enabled: true, key: 'token', value: 'protocol-token' },
      { enabled: true, key: 'userId', value: 'user-42' },
      { enabled: true, key: 'userName', value: 'Ada' },
      ...extraVariables
    ]
  };
}

function jsString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
