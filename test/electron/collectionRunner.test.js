const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { collectionRunResultToCsv, runCollection, runRunner } = require('../../src/core/collectionRunner');
const { resolveEnvironmentValue } = require('../../src/core/environmentResolver');
const { collectionModel, requestModel } = require('../../src/core/models');
const { AUTH_TYPE_VALUES } = require('../../src/core/payloadSchemas');
const { importPostmanCollection } = require('../../src/core/postmanImporter');
const { runRequestWithScripts } = require('../../src/core/requestScriptRunner');
const { MemoryVaultStore } = require('../../src/core/vaultStore');

test('runs collection requests sequentially and carries script-mutated variables', async () => {
  const collection = collectionModel({
    id: 'c1',
    name: 'Runner',
    variables: [{ enabled: true, key: 'baseUrl', value: 'https://collection.example.test' }],
    requests: [
      requestModel({
        id: 'login',
        name: 'Login',
        method: 'POST',
        url: 'https://api.example.test/login',
        scripts: { tests: "pm.environment.set('token', pm.response.json().token);" }
      }),
      requestModel({
        id: 'profile',
        name: 'Profile',
        method: 'GET',
        url: 'https://api.example.test/profile',
        headers: [{ enabled: true, key: 'Authorization', value: 'Bearer {{token}}' }],
        scripts: { tests: "pm.test('profile ok', function () { pm.expect(pm.response.json().ok).to.equal(true); });" }
      })
    ],
    folders: []
  });
  const sends = [];

  const result = await runCollection(collection, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request, environment) => {
      sends.push({
        requestId: request.id,
        token: environment.variables.find((item) => item.key === 'token')?.value || '',
        baseUrl: environment.variables.find((item) => item.key === 'baseUrl')?.value || ''
      });
      if (request.id === 'login') {
        return response(200, '{"token":"runner-token"}');
      }
      return response(200, '{"ok":true}');
    }
  });

  assert.equal(result.passed, true);
  assert.equal(result.totalRequests, 2);
  assert.equal(result.passedRequests, 2);
  assert.equal(sends[0].token, '');
  assert.equal(sends[0].baseUrl, 'https://collection.example.test');
  assert.equal(sends[1].token, 'runner-token');
  assert.equal(result.environment.variables.find((item) => item.key === 'token').value, 'runner-token');
  assert.equal(result.collectionVariables.find((item) => item.key === 'baseUrl').value, 'https://collection.example.test');
});

test('passes cookie jar through collection runs and returns updated cookies', async () => {
  const collection = collectionModel({
    name: 'Cookies',
    requests: [requestModel({
      id: 'cookie-request',
      name: 'Cookie Request',
      method: 'GET',
      url: 'https://api.example.test/cookies',
      cookieJar: { enabled: true, storeResponses: true }
    })]
  });
  const result = await runCollection(collection, null, {
    cookieJar: [{ enabled: true, name: 'sid', value: 'initial', domain: 'api.example.test', path: '/', secure: false, httpOnly: true, sameSite: 'Lax', hostOnly: true }],
    sendRequest: async (_request, _environment, options) => {
      assert.equal(options.cookieJar[0].value, 'initial');
      return {
        ...response(200, '{}'),
        updatedCookies: [{ enabled: true, name: 'sid', value: 'updated', domain: 'api.example.test', path: '/', secure: false, httpOnly: true, sameSite: 'Lax', hostOnly: true }]
      };
    }
  });

  assert.equal(result.passed, true);
  assert.equal(result.cookies[0].value, 'updated');
});

test('captures TLS policy diagnostics in collection runner transport details', async () => {
  const collection = collectionModel({
    name: 'TLS Diagnostics',
    requests: [requestModel({
      id: 'tls-request',
      name: 'TLS Request',
      method: 'GET',
      url: 'https://api.example.test/tls'
    })]
  });
  const observed = [];

  const result = await runCollection(collection, null, {
    includeTransportDiagnostics: true,
    sendRequest: async (_request, _environment, options) => {
      observed.push(options.collectTimings === true);
      return {
        ...response(200, '{}'),
        headers: { 'content-type': ['application/json'], 'x-trace': ['yes'] },
        timings: {
          tlsHandshakeMillis: 12,
          tls: {
            protocol: 'TLSv1.3'
          }
        },
        tls: {
          protocol: 'TLSv1.3',
          verificationDisabled: true,
          caCertificateConfigured: true,
          clientCertificateConfigured: true,
          clientCertificateId: 'managed-cert'
        }
      };
    }
  });

  assert.deepEqual(observed, [true]);
  assert.equal(result.results[0].finalUrl, 'https://api.example.test');
  assert.equal(result.results[0].responseHeaders['x-trace'][0], 'yes');
  assert.equal(result.results[0].tls.verificationDisabled, true);
  assert.equal(result.results[0].tls.clientCertificateId, 'managed-cert');
  assert.equal(result.results[0].timings.tls.verificationDisabled, true);
  assert.equal(result.results[0].timings.tls.protocol, 'TLSv1.3');
});

test('carries refreshed OAuth auth forward during collection runs', async () => {
  const oauthRequest = requestModel({
    id: 'oauth-request',
    name: 'OAuth Request',
    method: 'GET',
    url: 'https://api.example.test/oauth',
    auth: { type: 'oauth2', grantType: 'clientCredentials', accessToken: 'stale-token' }
  });
  const collection = collectionModel({
    name: 'OAuth Collection',
    requests: [oauthRequest, oauthRequest]
  });
  const observedAuth = [];
  const result = await runCollection(collection, null, {
    sendRequest: async (request) => {
      observedAuth.push(request.auth.accessToken);
      return {
        ...response(200, '{}'),
        updatedAuth: { ...request.auth, accessToken: 'fresh-token' }
      };
    }
  });

  assert.equal(result.passed, true);
  assert.deepEqual(observedAuth, ['stale-token', 'fresh-token']);
  assert.equal(result.results[0].updatedAuth.accessToken, 'fresh-token');
  assert.equal(Object.prototype.propertyIsEnumerable.call(result.results[0], 'updatedAuth'), false);
  assert.equal(JSON.stringify(result).includes('fresh-token'), false);
  assert.equal(result.authUpdates.get('oauth-request').accessToken, 'fresh-token');
});

test('runner auth refresh updates variables before runner requests', async () => {
  const runner = {
    id: 'runner-refresh',
    name: 'Runner Refresh',
    environmentId: 'env',
    authRefresh: {
      enabled: true,
      mode: 'lifetime',
      targetScope: 'environment',
      accessTokenVariable: 'ACCESS_TOKEN',
      refreshTokenVariable: 'REFRESH_TOKEN',
      expiresAtVariable: 'ACCESS_TOKEN_EXPIRES_AT',
      tokenLifetimeSeconds: 600,
      refreshWindowSeconds: 120,
      request: {
        id: 'refresh-auth',
        name: 'Refresh Auth',
        method: 'POST',
        url: 'https://auth.example.test/token',
        bodyType: 'RAW_JSON',
        body: '{"refresh":"{{REFRESH_TOKEN}}"}'
      }
    },
    requests: [
      {
        ...requestModel({
        id: 'resource',
        name: 'Resource',
        method: 'GET',
        url: 'https://api.example.test/resource',
        headers: [{ enabled: true, key: 'Authorization', value: 'Bearer {{ACCESS_TOKEN}}' }]
      }),
        iterations: 2
      }
    ]
  };
  const observed = [];
  let refreshCalls = 0;
  const result = await runRunner(runner, {
    id: 'env',
    name: 'Env',
    variables: [{ enabled: true, key: 'REFRESH_TOKEN', value: 'refresh-1' }]
  }, {
    sendRequest: async (request, environment) => {
      if (request.id === 'refresh-auth') {
        refreshCalls += 1;
        return response(200, JSON.stringify({
          access_token: 'fresh-runner-token',
          refresh_token: 'refresh-2',
          expires_in: 600
        }));
      }
      observed.push(resolveEnvironmentValue('{{ACCESS_TOKEN}}', environment));
      return response(200, '{}');
    }
  });

  assert.equal(result.passed, true);
  assert.equal(result.totalRequests, 2);
  assert.equal(refreshCalls, 1);
  assert.deepEqual(observed, ['fresh-runner-token', 'fresh-runner-token']);
  assert.equal(result.environment.variables.find((item) => item.key === 'ACCESS_TOKEN').value, 'fresh-runner-token');
  assert.equal(result.environment.variables.find((item) => item.key === 'REFRESH_TOKEN').value, 'refresh-2');
  assert.equal(result.authRefresh.refreshCount, 1);
});

test('runner auth refresh can rotate refresh tokens with a separate request before getting access tokens', async () => {
  const runner = {
    id: 'runner-refresh-token-request',
    name: 'Runner Refresh Token Request',
    environmentId: 'env',
    authRefresh: {
      enabled: true,
      mode: 'interval',
      targetScope: 'environment',
      accessTokenVariable: 'ACCESS_TOKEN',
      refreshTokenVariable: 'REFRESH_TOKEN',
      refreshBeforeRun: true,
      outputs: [
        { slot: 'accessToken', source: 'body', path: 'access_token', variable: 'ACCESS_TOKEN' },
        { slot: 'refreshToken', source: 'body', path: 'refresh_token', variable: 'REFRESH_TOKEN' }
      ],
      refreshTokenRequest: {
        id: 'rotate-refresh-token',
        name: 'Rotate Refresh Token',
        method: 'POST',
        url: 'https://auth.example.test/refresh-token'
      },
      request: {
        id: 'get-access-token',
        name: 'Get Access Token',
        method: 'POST',
        url: 'https://auth.example.test/access'
      }
    },
    requests: [
      requestModel({
        id: 'resource',
        name: 'Resource',
        method: 'GET',
        url: 'https://api.example.test/resource',
        headers: [{ enabled: true, key: 'Authorization', value: 'Bearer {{ACCESS_TOKEN}}' }]
      })
    ]
  };
  const sends = [];

  const result = await runRunner(runner, {
    id: 'env',
    name: 'Env',
    variables: [{ enabled: true, key: 'REFRESH_TOKEN', value: 'refresh-1' }]
  }, {
    sendRequest: async (request, environment) => {
      sends.push({
        id: request.id,
        accessToken: (environment.variables || []).find((item) => item.key === 'ACCESS_TOKEN')?.value || '',
        refreshToken: (environment.variables || []).find((item) => item.key === 'REFRESH_TOKEN')?.value || ''
      });
      if (request.id === 'rotate-refresh-token') {
        return response(200, JSON.stringify({ refresh_token: 'refresh-2' }));
      }
      if (request.id === 'get-access-token') {
        return response(200, JSON.stringify({ access_token: 'access-2', expires_in: 600 }));
      }
      return response(200, '{}');
    }
  });

  assert.equal(result.passed, true);
  assert.deepEqual(sends, [
    { id: 'rotate-refresh-token', accessToken: '', refreshToken: 'refresh-1' },
    { id: 'get-access-token', accessToken: '', refreshToken: 'refresh-2' },
    { id: 'resource', accessToken: 'access-2', refreshToken: 'refresh-2' }
  ]);
  assert.equal(result.environment.variables.find((item) => item.key === 'REFRESH_TOKEN').value, 'refresh-2');
  assert.equal(result.environment.variables.find((item) => item.key === 'ACCESS_TOKEN').value, 'access-2');
  assert.equal(result.authRefresh.refreshCount, 1);
});

test('runner auth refresh executes refresh requests with every supported auth type', async () => {
  for (const type of AUTH_TYPE_VALUES) {
    const runner = {
      id: `runner-refresh-auth-${type}`,
      name: `Runner Refresh ${type}`,
      environmentId: 'env',
      authRefresh: {
        enabled: true,
        mode: 'lifetime',
        targetScope: 'environment',
        accessTokenVariable: 'ACCESS_TOKEN',
        refreshBeforeRun: true,
        request: {
          id: `refresh-auth-${type}`,
          name: `${type} Refresh Auth`,
          method: 'POST',
          url: 'https://auth.example.test/token',
          auth: authForType(type)
        }
      },
      requests: [
        {
          ...requestModel({
            id: `resource-${type}`,
            name: `${type} Resource`,
            method: 'GET',
            url: 'https://api.example.test/resource',
            headers: [{ enabled: true, key: 'Authorization', value: 'Bearer {{ACCESS_TOKEN}}' }]
          }),
          iterations: 1
        }
      ]
    };
    const observedRefreshAuthTypes = [];
    const observedResourceTokens = [];

    const result = await runRunner(runner, { id: 'env', name: 'Env', variables: [] }, {
      sendRequest: async (request, environment) => {
        if (request.id === `refresh-auth-${type}`) {
          observedRefreshAuthTypes.push(request.auth?.type || 'none');
          assert.equal((environment.variables || []).some((variable) => variable.key === 'ACCESS_TOKEN'), false, type);
          return response(200, JSON.stringify({ access_token: `fresh-${type}`, expires_in: 600 }));
        }
        observedResourceTokens.push(resolveEnvironmentValue('{{ACCESS_TOKEN}}', environment));
        return response(200, '{}');
      }
    });

    assert.equal(result.passed, true, `${type} runner should pass`);
    assert.deepEqual(observedRefreshAuthTypes, [type], `${type} refresh request auth should be preserved`);
    assert.deepEqual(observedResourceTokens, [`fresh-${type}`], `${type} should refresh before resource request`);
    assert.equal(result.authRefresh.refreshCount, 1, `${type} should refresh once`);
  }
});

test('runner auth refresh saves multiple typed outputs for temporary AWS credentials', async () => {
  const runner = {
    id: 'runner-refresh-aws-outputs',
    name: 'Runner Refresh AWS Outputs',
    environmentId: 'env',
    authRefresh: {
      enabled: true,
      mode: 'interval',
      authType: 'aws',
      targetScope: 'environment',
      accessTokenVariable: 'AWS_ACCESS_KEY_ID',
      refreshBeforeRun: true,
      outputs: [
        { slot: 'awsAccessKey', source: 'body', path: 'credentials.accessKeyId', variable: 'AWS_ACCESS_KEY_ID' },
        { slot: 'awsSecretKey', source: 'body', path: 'credentials.secretAccessKey', variable: 'AWS_SECRET_ACCESS_KEY' },
        { slot: 'awsSessionToken', source: 'body', path: 'credentials.sessionToken', variable: 'AWS_SESSION_TOKEN' }
      ],
      request: {
        id: 'refresh-aws',
        name: 'Refresh AWS',
        method: 'POST',
        url: 'https://auth.example.test/aws'
      }
    },
    requests: [
      {
        ...requestModel({
          id: 'aws-resource',
          name: 'AWS Resource',
          method: 'GET',
          url: 'https://api.example.test/resource',
          auth: {
            type: 'aws',
            accessKey: '{{AWS_ACCESS_KEY_ID}}',
            secretKey: '{{AWS_SECRET_ACCESS_KEY}}',
            sessionToken: '{{AWS_SESSION_TOKEN}}',
            region: 'us-east-1',
            service: 'execute-api'
          }
        }),
        iterations: 1
      }
    ]
  };
  const observed = [];
  const result = await runRunner(runner, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request, environment) => {
      if (request.id === 'refresh-aws') {
        return response(200, JSON.stringify({
          credentials: {
            accessKeyId: 'AKIA_REFRESHED',
            secretAccessKey: 'secret-refreshed',
            sessionToken: 'session-refreshed'
          }
        }));
      }
      observed.push({
        accessKey: resolveEnvironmentValue(request.auth.accessKey, environment),
        secretKey: resolveEnvironmentValue(request.auth.secretKey, environment),
        sessionToken: resolveEnvironmentValue(request.auth.sessionToken, environment)
      });
      return response(200, '{}');
    }
  });

  assert.equal(result.passed, true);
  assert.deepEqual(observed, [{
    accessKey: 'AKIA_REFRESHED',
    secretKey: 'secret-refreshed',
    sessionToken: 'session-refreshed'
  }]);
  assert.equal(result.environment.variables.find((item) => item.key === 'AWS_SESSION_TOKEN').value, 'session-refreshed');
});

test('auth refresh coexists with every supported runner request auth type', async () => {
  for (const type of AUTH_TYPE_VALUES) {
    const collection = {
      ...collectionModel({
      id: `collection-${type}`,
      name: `Refresh ${type}`,
      requests: [
        requestModel({
          id: `request-${type}`,
          name: `${type} request`,
          method: 'GET',
          url: 'https://api.example.test/resource',
          headers: [{ enabled: true, key: 'X-Refresh-Token', value: '{{AUTH_SECRET}}' }],
          auth: authForType(type)
        })
      ]
    }),
      authRefresh: {
        enabled: true,
        mode: 'interval',
        targetScope: 'environment',
        accessTokenVariable: 'AUTH_SECRET',
        refreshBeforeRun: true,
        request: {
          id: 'refresh-auth',
          name: 'Refresh Auth',
          method: 'POST',
          url: 'https://auth.example.test/token'
        }
      }
    };
    const observed = [];
    const result = await runCollection(collection, { id: 'env', name: 'Env', variables: [] }, {
      sendRequest: async (request, environment) => {
        if (request.id === 'refresh-auth') {
          return response(200, JSON.stringify({ access_token: `fresh-${type}`, expires_in: 600 }));
        }
        observed.push({
          authType: request.auth?.type || 'none',
          token: resolveEnvironmentValue('{{AUTH_SECRET}}', environment)
        });
        return response(200, '{}');
      }
    });

    assert.equal(result.passed, true, `${type} runner should pass`);
    assert.deepEqual(observed, [{ authType: type, token: `fresh-${type}` }], `${type} should see refreshed token`);
    assert.equal(result.authRefresh.refreshCount, 1, `${type} should refresh once`);
  }
});

test('exports collection runner results to CSV', () => {
  const csv = collectionRunResultToCsv({
    collectionId: 'c1',
    collectionName: 'Exports',
    totalRequests: 1,
    passedRequests: 1,
    failedRequests: 0,
    passed: true,
    cancelled: false,
    results: [{
      requestId: 'r1',
      requestName: 'Request',
      folderName: '',
      startedAt: '2026-04-21T00:00:00.000Z',
      statusCode: 200,
      durationMillis: 12,
      passed: true,
      error: ''
    }],
    collectionVariables: [{ enabled: true, key: 'baseUrl', value: 'https://api.example.test' }],
    environment: { variables: [{ enabled: true, key: 'token', value: 'secret' }] }
  });

  assert.match(csv, /collectionName,Exports/);
  assert.match(csv, /requestId,requestName,folderName/);
  assert.match(csv, /statusCode/);
  assert.match(csv, /runtimeScope,requestId,key,value/);
  assert.match(csv, /collection,,baseUrl,https:\/\/api.example.test/);
  assert.match(csv, /environment,,token,secret/);
});

test('runs pre-request and test scripts during collection runs', async () => {
  const collection = collectionModel({
    name: 'Scripts',
    variables: [{ enabled: true, key: 'baseUrl', value: 'https://script.example.test' }],
    requests: [requestModel({
      id: 'scripted',
      name: 'Scripted',
      method: 'GET',
      url: '{{baseUrl}}/widgets',
      variables: [{ enabled: true, key: 'requestToken', value: 'local-token' }],
      scripts: {
        preRequest: "pm.environment.set('token', 'script-token');",
        tests: `
          pm.test('script sees response', function () {
            pm.response.to.have.status(200);
            pm.expect(pm.response.json().ok).to.eql(true);
            pm.expect(pm.variables.get('requestToken')).to.equal('local-token');
          });
          pm.collectionVariables.set('fromTests', 'done');
        `
      }
    })]
  });

  const sends = [];
  const result = await runCollection(collection, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request, environment) => {
      sends.push({
        url: request.url,
        baseUrl: environment.variables.find((item) => item.key === 'baseUrl')?.value,
        token: environment.variables.find((item) => item.key === 'token')?.value
      });
      return response(200, '{"ok":true}');
    }
  });

  assert.equal(result.passed, true);
  assert.equal(sends[0].baseUrl, 'https://script.example.test');
  assert.equal(sends[0].token, 'script-token');
  assert.equal(result.results[0].testScriptResult.tests[0].passed, true);
  assert.equal(result.results[0].localVariables.find((item) => item.key === 'requestToken').value, 'local-token');
  assert.equal(result.collectionVariables.find((item) => item.key === 'fromTests').value, 'done');
});

test('runs workspace-owned runner requests in runner-local order and exposes environment mutation policy', async () => {
  const runner = {
    id: 'runner-1',
    name: 'Workspace Runner',
    environmentId: 'env',
    allowEnvironmentMutation: false,
    stopOnFailure: false,
    requests: [
      requestModel({
        id: 'runner-local-2',
        name: 'Second Clone',
        method: 'GET',
        url: 'https://api.example.test/second',
        scripts: { tests: "pm.environment.set('runnerToken', 'mutated');" }
      }),
      requestModel({
        id: 'runner-local-1',
        name: 'First Clone',
        method: 'GET',
        url: 'https://api.example.test/first',
        scripts: {
          preRequest: "pm.environment.set('seenBySend', 'yes');",
          tests: "pm.test('runner script executed', function () { pm.expect(pm.environment.get('seenBySend')).to.equal('yes'); });"
        }
      })
    ]
  };
  const sent = [];

  const result = await runRunner(runner, { id: 'env', name: 'Env', variables: [{ enabled: true, key: 'runnerToken', value: 'base' }] }, {
    sendRequest: async (request, environment) => {
      sent.push({
        id: request.id,
        seenBySend: environment.variables.find((item) => item.key === 'seenBySend')?.value || ''
      });
      return response(200, '{"ok":true}');
    }
  });

  assert.deepEqual(sent.map((item) => item.id), ['runner-local-2', 'runner-local-1']);
  assert.equal(sent[1].seenBySend, 'yes');
  assert.equal(result.runnerId, 'runner-1');
  assert.equal(result.environmentMutationAllowed, false);
  assert.equal(result.mutatedEnvironment, undefined);
  assert.equal(result.results[0].requestId, 'runner-local-2');
  assert.equal(result.environment.variables.find((item) => item.key === 'runnerToken').value, 'mutated');
});

test('workspace-owned runner exposes mutated environment when persistence is allowed', async () => {
  const runner = {
    id: 'runner-mutate',
    name: 'Mutating Runner',
    environmentId: 'env',
    allowEnvironmentMutation: true,
    stopOnFailure: false,
    requests: [requestModel({
      id: 'runner-request',
      name: 'Mutates Env',
      url: 'https://api.example.test/mutate',
      scripts: { tests: "pm.environment.set('persistMe', 'yes');" }
    })]
  };
  const sourceEnvironment = { id: 'env', name: 'Env', variables: [] };

  const result = await runRunner(runner, sourceEnvironment, {
    sendRequest: async () => response(200, '{}')
  });

  assert.equal(sourceEnvironment.variables.length, 0);
  assert.equal(result.environmentMutationAllowed, true);
  assert.equal(result.mutatedEnvironment.id, 'env');
  assert.equal(result.mutatedEnvironment.variables.find((item) => item.key === 'persistMe').value, 'yes');
});

test('workspace-owned runner repeats a row by its configured iterations', async () => {
  const runner = {
    id: 'runner-iterations',
    name: 'Iterating Runner',
    environmentId: 'none',
    stopOnFailure: false,
    requests: [
      { ...requestModel({ id: 'repeat', name: 'Repeat', url: 'https://api.example.test/repeat' }), iterations: 3 },
      requestModel({ id: 'next', name: 'Next', url: 'https://api.example.test/next' })
    ]
  };
  const sent = [];

  const result = await runRunner(runner, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request) => {
      sent.push({
        id: request.id,
        runnerIteration: request.runnerIteration,
        runnerIterations: request.runnerIterations
      });
      return response(200, '{}');
    }
  });

  assert.equal(result.totalRequests, 4);
  assert.deepEqual(sent.map((item) => item.id), ['repeat', 'repeat', 'repeat', 'next']);
  assert.deepEqual(sent.map((item) => item.runnerIteration), [1, 2, 3, 1]);
  assert.deepEqual(result.results.map((item) => item.runnerIteration), [1, 2, 3, 1]);
  assert.deepEqual(result.results.map((item) => item.runnerIterations), [3, 3, 3, 1]);
});

test('workspace-owned runner consumes CSV variable rows across request iterations', async () => {
  const runner = {
    id: 'runner-csv',
    name: 'CSV Runner',
    environmentId: 'none',
    stopOnFailure: false,
    csvVariables: {
      schema: 'requestName,requestUrl,requestBody',
      values: [
        'request1,https://api.example.test/one,"{""id"":1,""name"":""one""}"',
        'request2,https://api.example.test/two,"{""id"":2,""name"":""two""}"',
        'request3,https://api.example.test/three,"{""id"":3,""name"":""three""}"'
      ].join('\n')
    },
    requests: [{
      ...requestModel({
        id: 'csv-request',
        name: '${requestName}',
        method: 'POST',
        url: '${requestUrl}',
        bodyType: 'RAW_TEXT',
        body: '${requestBody}',
        scripts: {
          tests: `
            pm.test('iteration data is visible to scripts', function () {
              pm.expect(pm.iterationData.get('requestName')).to.match(/^request/);
            });
          `
        }
      }),
      iterations: 3
    }]
  };
  const sent = [];

  const result = await runRunner(runner, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request, environment) => {
      sent.push({
        name: resolveEnvironmentValue(request.name, environment),
        url: resolveEnvironmentValue(request.url, environment),
        body: resolveEnvironmentValue(request.body, environment)
      });
      return response(200, '{"ok":true}');
    }
  });

  assert.equal(result.passed, true);
  assert.deepEqual(sent, [
    {
      name: 'request1',
      url: 'https://api.example.test/one',
      body: '{"id":1,"name":"one"}'
    },
    {
      name: 'request2',
      url: 'https://api.example.test/two',
      body: '{"id":2,"name":"two"}'
    },
    {
      name: 'request3',
      url: 'https://api.example.test/three',
      body: '{"id":3,"name":"three"}'
    }
  ]);
  assert.deepEqual(result.results.map((item) => item.requestDisplayName), ['request1', 'request2', 'request3']);
  assert.deepEqual(result.results.map((item) => item.requestUrl), [
    'https://api.example.test/one',
    'https://api.example.test/two',
    'https://api.example.test/three'
  ]);
  assert.deepEqual(result.results.map((item) => item.requestMethod), ['POST', 'POST', 'POST']);
  assert.deepEqual(result.results.map((item) => item.runnerIteration), [1, 2, 3]);
  assert.equal(result.results[0].testScriptResult.tests[0].passed, true);
});

test('workspace-owned runner streams CSV variable rows from a file reference', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-csv-'));
  const csvPath = path.join(tempDir, 'variables.csv');
  await fs.writeFile(csvPath, [
    'https://api.example.test/one,"{""id"":1}"',
    'https://api.example.test/two,"{""id"":2}"',
    'https://api.example.test/unused,"{""id"":3}"'
  ].join('\n'));
  const sent = [];
  try {
    const result = await runRunner({
      id: 'runner-csv-file',
      name: 'CSV File Runner',
      csvVariables: {
        schema: 'requestUrl,requestBody',
        values: 'https://api.example.test/stale,"{""id"":0}"',
        filePath: csvPath,
        sourceName: 'variables.csv'
      },
      requests: [{
        ...requestModel({
          id: 'csv-file-request',
          name: 'CSV File Request',
          method: 'POST',
          url: '${requestUrl}',
          bodyType: 'RAW_TEXT',
          body: '${requestBody}'
        }),
        iterations: 2
      }]
    }, { id: 'env', name: 'Env', variables: [] }, {
      sendRequest: async (request, environment) => {
        sent.push({
          url: resolveEnvironmentValue(request.url, environment),
          body: resolveEnvironmentValue(request.body, environment)
        });
        return response(200, '{"ok":true}');
      }
    });

    assert.equal(result.passed, true);
    assert.deepEqual(sent, [
      { url: 'https://api.example.test/one', body: '{"id":1}' },
      { url: 'https://api.example.test/two', body: '{"id":2}' }
    ]);
    assert.deepEqual(result.results.map((item) => item.requestUrl), [
      'https://api.example.test/one',
      'https://api.example.test/two'
    ]);

    sent.length = 0;
    await runRunner({
      id: 'runner-csv-inline-active',
      name: 'CSV Inline Active Runner',
      csvVariables: {
        schema: 'requestUrl,requestBody',
        values: 'https://api.example.test/inline,"{""id"":9}"',
        filePath: csvPath,
        sourceName: 'variables.csv',
        activeSource: 'inline'
      },
      requests: [{
        ...requestModel({
          id: 'csv-inline-active-request',
          name: 'CSV Inline Active Request',
          method: 'POST',
          url: '${requestUrl}',
          bodyType: 'RAW_TEXT',
          body: '${requestBody}'
        }),
        iterations: 1
      }]
    }, { id: 'env', name: 'Env', variables: [] }, {
      sendRequest: async (request, environment) => {
        sent.push({
          url: resolveEnvironmentValue(request.url, environment),
          body: resolveEnvironmentValue(request.body, environment)
        });
        return response(200, '{"ok":true}');
      }
    });
    assert.deepEqual(sent, [
      { url: 'https://api.example.test/inline', body: '{"id":9}' }
    ]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('workspace-owned runner rejects CSV variable data with too few rows for expanded iterations', async () => {
  const runner = {
    id: 'runner-csv-short',
    name: 'Short CSV Runner',
    csvVariables: {
      schema: 'requestUrl',
      values: 'https://api.example.test/one'
    },
    requests: [{
      ...requestModel({ id: 'repeat', name: 'Repeat', url: '${requestUrl}' }),
      iterations: 2
    }]
  };

  await assert.rejects(
    () => runRunner(runner, { id: 'env', name: 'Env', variables: [] }, {
      sendRequest: async () => response(200, '{}')
    }),
    /CSV variable data has 1 row, but this run needs 2/
  );
});

test('workspace-owned runner can loop CSV variable rows across more iterations than data rows', async () => {
  const runner = {
    id: 'runner-csv-loop',
    name: 'CSV Loop Runner',
    csvVariables: {
      schema: 'requestUrl',
      values: [
        'https://api.example.test/one',
        'https://api.example.test/two',
        'https://api.example.test/three'
      ].join('\n'),
      loopRows: true
    },
    requests: [{
      ...requestModel({ id: 'loop-request', name: 'Loop Request', url: '${requestUrl}' }),
      iterations: 10
    }]
  };
  const sent = [];

  const result = await runRunner(runner, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request, environment) => {
      sent.push(resolveEnvironmentValue(request.url, environment));
      return response(200, '{}');
    }
  });

  assert.equal(result.passed, true);
  assert.deepEqual(sent, [
    'https://api.example.test/one',
    'https://api.example.test/two',
    'https://api.example.test/three',
    'https://api.example.test/one',
    'https://api.example.test/two',
    'https://api.example.test/three',
    'https://api.example.test/one',
    'https://api.example.test/two',
    'https://api.example.test/three',
    'https://api.example.test/one'
  ]);
  assert.deepEqual(result.results.map((item) => item.requestUrl), sent);
});

test('workspace-owned runner can continue without CSV variable rows after data runs out', async () => {
  const runner = {
    id: 'runner-csv-continue',
    name: 'CSV Continue Runner',
    csvVariables: {
      schema: 'requestUrl',
      values: [
        'https://api.example.test/one',
        'https://api.example.test/two',
        'https://api.example.test/three'
      ].join('\n'),
      continueWithoutRows: true
    },
    requests: [{
      ...requestModel({ id: 'continue-request', name: 'Continue Request', url: '${requestUrl}' }),
      iterations: 5
    }]
  };
  const sent = [];

  const result = await runRunner(runner, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request, environment) => {
      sent.push(resolveEnvironmentValue(request.url, environment));
      return response(200, '{}');
    }
  });

  assert.equal(result.passed, true);
  assert.deepEqual(sent, [
    'https://api.example.test/one',
    'https://api.example.test/two',
    'https://api.example.test/three',
    '${requestUrl}',
    '${requestUrl}'
  ]);
  assert.deepEqual(result.results.map((item) => item.requestUrl), sent);
});

test('workspace-owned runner can reuse the first CSV variable row across all requests', async () => {
  const runner = {
    id: 'runner-csv-reuse-first',
    name: 'CSV Reuse First Runner',
    csvVariables: {
      schema: 'username,password',
      values: 'alice,correct-horse',
      reuseFirstRow: true
    },
    requests: [
      {
        ...requestModel({
          id: 'login',
          name: 'Login ${username}',
          method: 'POST',
          url: 'https://api.example.test/login',
          bodyType: 'RAW_TEXT',
          body: '${username}:${password}'
        }),
        iterations: 1
      },
      {
        ...requestModel({
          id: 'profile',
          name: 'Profile ${username}',
          method: 'GET',
          url: 'https://api.example.test/users/${username}'
        }),
        iterations: 2
      }
    ]
  };
  const sent = [];

  const result = await runRunner(runner, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request, environment) => {
      sent.push({
        name: resolveEnvironmentValue(request.name, environment),
        url: resolveEnvironmentValue(request.url, environment),
        body: resolveEnvironmentValue(request.body, environment)
      });
      return response(200, '{}');
    }
  });

  assert.equal(result.passed, true);
  assert.deepEqual(sent, [
    {
      name: 'Login alice',
      url: 'https://api.example.test/login',
      body: 'alice:correct-horse'
    },
    {
      name: 'Profile alice',
      url: 'https://api.example.test/users/alice',
      body: ''
    },
    {
      name: 'Profile alice',
      url: 'https://api.example.test/users/alice',
      body: ''
    }
  ]);
  assert.deepEqual(result.results.map((item) => item.requestDisplayName), ['Login alice', 'Profile alice', 'Profile alice']);
});

test('workspace-owned runner can disable configured CSV variable data from the main pane option', async () => {
  const sent = [];
  const result = await runRunner({
    id: 'runner-csv-disabled',
    name: 'CSV Disabled Runner',
    csvVariables: {
      enabled: false,
      schema: 'requestUrl',
      values: 'https://api.example.test/one'
    },
    requests: [{
      ...requestModel({ id: 'disabled-request', name: 'Disabled Request', url: '${requestUrl}' }),
      iterations: 1
    }]
  }, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request, environment) => {
      sent.push(resolveEnvironmentValue(request.url, environment));
      return response(200, '{}');
    }
  });

  assert.equal(result.passed, true);
  assert.deepEqual(sent, ['${requestUrl}']);
  assert.equal(result.results[0].requestUrl, '${requestUrl}');
});

test('workspace-owned runner stop-on-failure stops inside repeated rows', async () => {
  const runner = {
    id: 'runner-repeat-failure',
    name: 'Repeat Failure Runner',
    environmentId: 'none',
    stopOnFailure: true,
    requests: [
      { ...requestModel({ id: 'repeat', name: 'Repeat', url: 'https://api.example.test/repeat' }), iterations: 3 },
      requestModel({ id: 'next', name: 'Next', url: 'https://api.example.test/next' })
    ]
  };
  const sent = [];

  const result = await runRunner(runner, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request) => {
      sent.push(request.id);
      if (sent.length === 2) {
        throw new Error('repeat failed');
      }
      return response(200, '{}');
    }
  });

  assert.equal(result.totalRequests, 2);
  assert.equal(result.failedRequests, 1);
  assert.deepEqual(sent, ['repeat', 'repeat']);
  assert.equal(result.results[1].runnerIteration, 2);
  assert.equal(result.results[1].runnerIterations, 3);
  assert.match(result.results[1].error, /repeat failed/);
});

test('workspace-owned runner rejects expanded executions over the result limit', async () => {
  const runner = {
    id: 'runner-too-many',
    name: 'Too Many Runner',
    requests: [
      { ...requestModel({ id: 'repeat', name: 'Repeat', url: 'https://api.example.test/repeat' }), iterations: 3 }
    ]
  };

  await assert.rejects(
    () => runRunner(runner, { id: 'env', name: 'Env', variables: [] }, {
      maxRunnerExecutions: 2,
      sendRequest: async () => response(200, '{}')
    }),
    /Runner cannot execute more than 2 request iterations/
  );
});

test('workspace-owned runner honors runtime environment mutation override', async () => {
  const runner = {
    id: 'runner-override',
    name: 'Override Runner',
    environmentId: 'env',
    allowEnvironmentMutation: false,
    requests: [requestModel({
      id: 'runner-request',
      name: 'Mutates Env',
      url: 'https://api.example.test/mutate',
      scripts: { tests: "pm.environment.set('persistViaConfig', 'yes');" }
    })]
  };

  const result = await runRunner(runner, { id: 'env', name: 'Env', variables: [] }, {
    allowEnvironmentMutation: true,
    sendRequest: async () => response(200, '{}')
  });

  assert.equal(result.environmentMutationAllowed, true);
  assert.equal(result.mutatedEnvironment.variables.find((item) => item.key === 'persistViaConfig').value, 'yes');
});

test('runs pre-request and test scripts around single requests', async () => {
  const request = requestModel({
    id: 'single',
    name: 'Single Scripted',
    method: 'GET',
    url: '{{dynamicBaseUrl}}/session',
    variables: [{ enabled: true, key: 'requestToken', value: 'local-token' }],
    scripts: {
      preRequest: "pm.environment.set('beforeSend', 'ready'); pm.environment.set('dynamicBaseUrl', 'https://single.example.test');",
      tests: `
        pm.environment.set("REFRESH_TOKEN", pm.response.json().jwtToken);
        pm.collectionVariables.set('afterSend', 'done');
        pm.variables.set('requestToken', 'updated-local-token');
        pm.test('captured token', function () {
          pm.expect(pm.environment.get('REFRESH_TOKEN')).to.equal('refresh-123');
        });
      `
    }
  });
  const sends = [];

  const result = await runRequestWithScripts(request, { id: 'env', name: 'Env', variables: [] }, {
    collectionVariables: [],
    sendRequest: async (_request, environment) => {
      sends.push({
        dynamicBaseUrl: environment.variables.find((item) => item.key === 'dynamicBaseUrl')?.value,
        beforeSend: environment.variables.find((item) => item.key === 'beforeSend')?.value
      });
      return response(200, '{"jwtToken":"refresh-123"}');
    }
  });

  assert.equal(result.preRequestScriptResult.passed, true);
  assert.equal(result.testScriptResult.passed, true);
  assert.equal(sends[0].dynamicBaseUrl, 'https://single.example.test');
  assert.equal(sends[0].beforeSend, 'ready');
  assert.equal(result.environment.variables.find((item) => item.key === 'REFRESH_TOKEN').value, 'refresh-123');
  assert.equal(result.collectionVariables.find((item) => item.key === 'afterSend').value, 'done');
  assert.equal(result.localVariables.find((item) => item.key === 'requestToken').value, 'updated-local-token');
  assert.equal(result.response.environment.variables.find((item) => item.key === 'REFRESH_TOKEN').value, 'refresh-123');
  assert.equal(result.response.testScriptResult.tests[0].passed, true);
});

test('routes single-request pm.vault prompts through the shared lifecycle', async () => {
  const vault = new MemoryVaultStore({ token: 'secret-token' });
  const prompts = [];
  const request = requestModel({
    id: 'vault-request',
    name: 'Vault Request',
    method: 'GET',
    url: 'https://api.example.test/vault',
    scripts: {
      preRequest: `
        pm.test('prompted vault access', async function () {
          const token = await pm.vault.get('token');
          pm.environment.set('vaultToken', token);
        });
      `
    }
  });

  const result = await runRequestWithScripts(request, { id: 'env', name: 'Env', variables: [] }, {
    collectionId: 'collection-1',
    collectionName: 'Prompt Collection',
    sendRequest: async () => response(200, '{}'),
    trustedCapabilities: { vault: false, vaultGrants: {} },
    vault,
    vaultPrompt: async (payload) => {
      prompts.push(payload);
      return { granted: true, scope: 'request' };
    },
    workspaceId: 'Workspace.json',
    workspaceName: 'Workspace'
  });

  assert.equal(result.preRequestScriptResult.passed, true);
  assert.equal(result.environment.variables.find((item) => item.key === 'vaultToken').value, 'secret-token');
  assert.equal(prompts.length, 1);
  assert.deepEqual(prompts[0], {
    collectionId: 'collection-1',
    collectionName: 'Prompt Collection',
    key: 'token',
    operation: 'get',
    requestId: 'vault-request',
    requestName: 'Vault Request',
    workspaceId: 'Workspace.json',
    workspaceName: 'Workspace'
  });
});

test('denied single-request pm.vault prompts fail pre-request tests without blocking the main request', async () => {
  const vault = new MemoryVaultStore({ token: 'secret-token' });
  const request = requestModel({
    id: 'vault-denied',
    name: 'Vault Denied',
    method: 'GET',
    url: 'https://api.example.test/vault-denied',
    scripts: {
      preRequest: `
        pm.test('denied vault access', async function () {
          await pm.vault.get('token');
          pm.environment.set('afterDeniedVault', 'should-not-run');
        });
      `
    }
  });
  const sent = [];

  const result = await runRequestWithScripts(request, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (sentRequest) => {
      sent.push(sentRequest.id);
      return response(200, '{}');
    },
    trustedCapabilities: { vault: false, vaultGrants: {} },
    vault,
    vaultPrompt: async () => ({ granted: false, scope: 'request' })
  });

  assert.deepEqual(sent, ['vault-denied']);
  assert.equal(result.response.statusCode, 200);
  assert.match(result.preRequestScriptResult.tests[0].error, /pm\.vault access was denied/);
  assert.equal(result.environment.variables.find((item) => item.key === 'afterDeniedVault'), undefined);
  const audit = await vault.listAudit();
  assert.deepEqual(audit.map((entry) => entry.operation), ['prompt-deny', 'denied-after-call']);
});

test('routes collection-run pm.vault prompts through the shared lifecycle', async () => {
  const vault = new MemoryVaultStore({ token: 'collection-secret' });
  const prompts = [];
  const collection = collectionModel({
    id: 'collection-vault',
    name: 'Collection Vault',
    requests: [
      requestModel({
        id: 'vault-runner-request',
        name: 'Vault Runner Request',
        method: 'GET',
        url: 'https://api.example.test/vault-runner',
        scripts: {
          preRequest: `
            pm.test('prompted collection vault access', async function () {
              pm.collectionVariables.set('vaultToken', await pm.vault.get('token'));
            });
          `
        }
      })
    ]
  });

  const result = await runCollection(collection, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async () => response(200, '{}'),
    trustedCapabilities: { vault: false, vaultGrants: {} },
    vault,
    vaultPrompt: async (payload) => {
      prompts.push(payload);
      return { granted: true, scope: 'collection' };
    },
    workspaceId: 'Workspace.json',
    workspaceName: 'Workspace'
  });

  assert.equal(result.passed, true);
  assert.equal(result.collectionVariables.find((item) => item.key === 'vaultToken').value, 'collection-secret');
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].collectionId, 'collection-vault');
  assert.equal(prompts[0].collectionName, 'Collection Vault');
  assert.equal(prompts[0].requestId, 'vault-runner-request');
  assert.equal(prompts[0].requestName, 'Vault Runner Request');
  assert.equal(prompts[0].workspaceId, 'Workspace.json');
  assert.equal(prompts[0].workspaceName, 'Workspace');
});

test('routes nested pm.execution.runRequest vault prompts through the shared lifecycle', async () => {
  const vault = new MemoryVaultStore({ token: 'nested-secret' });
  const prompts = [];
  const collection = collectionModel({
    id: 'collection-nested-vault',
    name: 'Nested Vault',
    requests: [
      requestModel({
        id: 'caller',
        name: 'Caller',
        method: 'GET',
        url: 'https://api.example.test/caller',
        scripts: {
          tests: `
            pm.test('nested vault prompt', async function () {
              const response = await pm.execution.runRequest('target');
              pm.expect(response.code).to.equal(200);
              pm.expect(pm.environment.get('nestedVaultToken')).to.equal('nested-secret');
            });
          `
        }
      }),
      requestModel({
        id: 'target',
        name: 'Target',
        method: 'GET',
        url: 'https://api.example.test/target',
        scripts: {
          preRequest: `
            pm.test('target vault access', async function () {
              pm.environment.set('nestedVaultToken', await pm.vault.get('token'));
            });
          `
        }
      })
    ]
  });

  const result = await runCollection(collection, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async () => response(200, '{}'),
    trustedCapabilities: { vault: false, vaultGrants: {} },
    vault,
    vaultPrompt: async (payload) => {
      prompts.push(payload);
      return { granted: true, scope: 'request' };
    },
    workspaceId: 'Workspace.json',
    workspaceName: 'Workspace'
  });

  assert.equal(result.passed, true);
  assert.equal(result.environment.variables.find((item) => item.key === 'nestedVaultToken').value, 'nested-secret');
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].requestId, 'target');
  assert.equal(prompts[0].requestName, 'Target');
  assert.equal(prompts[0].collectionId, 'collection-nested-vault');
  assert.equal(prompts[0].collectionName, 'Nested Vault');
});

test('fails collection runs when scripts fail', async () => {
  const collection = collectionModel({
    name: 'Script Failures',
    requests: [
      requestModel({
        id: 'pre',
        name: 'Bad pre',
        method: 'GET',
        url: 'https://api.example.test',
        scripts: { preRequest: "throw new Error('no send');" }
      }),
      requestModel({
        id: 'tests',
        name: 'Bad tests',
        method: 'GET',
        url: 'https://api.example.test',
        scripts: { tests: "pm.test('bad', function () { pm.expect(1).to.equal(2); });" }
      })
    ]
  });
  let sends = 0;

  const result = await runCollection(collection, null, {
    sendRequest: async () => {
      sends++;
      return response(200, '{}');
    }
  });

  assert.equal(result.passed, false);
  assert.equal(sends, 2);
  assert.equal(result.results[0].statusCode, 200);
  assert.equal(result.results[0].error, '');
  assert.equal(result.results[0].preRequestScriptResult.error, 'no send');
  assert.equal(result.results[1].error, '');
  assert.equal(result.results[1].testScriptResult.tests[0].passed, false);
});

test('runs imported Postman collection, folder, and request scripts through the runner', async () => {
  const collection = importPostmanCollection({
    info: {
      name: 'Imported Scripted Postman',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    variable: [{ key: 'baseUrl', value: 'https://api.example.test' }],
    event: [{
      listen: 'prerequest',
      script: { exec: ["pm.collectionVariables.set('collectionStage', 'collection');"] }
    }],
    item: [{
      name: 'Folder',
      event: [{
        listen: 'prerequest',
        script: { exec: ["pm.environment.set('folderStage', 'folder');"] }
      }],
      item: [{
        name: 'Imported Request',
        request: {
          method: 'GET',
          url: {
            raw: '{{baseUrl}}/status?trace=postman',
            query: [{ key: 'trace', value: 'postman' }]
          }
        },
        event: [{
          listen: 'test',
          script: {
            exec: [
              "pm.test('postman event scripts ran', function () {",
              "  pm.response.to.have.status(200);",
              "  pm.expect(pm.collectionVariables.get('collectionStage')).to.equal(undefined);",
              "  pm.expect(pm.environment.get('folderStage')).to.equal('folder');",
              "  pm.expect(pm.request.url.toString()).to.include('/status');",
              "});"
            ]
          }
        }]
      }]
    }]
  });

  const result = await runCollection(collection, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (_request, environment) => {
      assert.equal(environment.variables.find((item) => item.key === 'folderStage').value, 'folder');
      return response(200, '{"ok":true}');
    }
  });

  assert.equal(result.passed, true);
  assert.equal(result.results[0].testScriptResult.tests[0].name, 'postman event scripts ran');
  assert.equal(result.collectionVariables.find((item) => item.key === 'collectionStage'), undefined);
});

test('collection runner resolves variables with request, folder, collection, environment precedence', async () => {
  const seenScopes = [];
  const collection = collectionModel({
    name: 'Folder Variable Precedence',
    variables: [
      { enabled: true, key: 'scope', value: 'collection' },
      { enabled: true, key: 'collectionOnly', value: 'collection' }
    ],
    requests: [
      requestModel({
        id: 'root',
        name: 'Root',
        method: 'GET',
        url: 'https://api.example.test/root',
        variables: []
      })
    ],
    folders: [{
      id: 'folder',
      name: 'Folder',
      variables: [
        { enabled: true, key: 'scope', value: 'folder' },
        { enabled: true, key: 'folderOnly', value: 'folder' }
      ],
      requests: [
        requestModel({
          id: 'folder-fallback',
          name: 'Folder Fallback',
          method: 'GET',
          url: 'https://api.example.test/folder',
          variables: []
        }),
        requestModel({
          id: 'request-override',
          name: 'Request Override',
          method: 'GET',
          url: 'https://api.example.test/request',
          variables: [{ enabled: true, key: 'scope', value: 'request' }]
        })
      ],
      folders: []
    }]
  });

  await runCollection(collection, {
    id: 'env',
    name: 'Env',
    variables: [
      { enabled: true, key: 'scope', value: 'environment' },
      { enabled: true, key: 'envOnly', value: 'environment' }
    ]
  }, {
    sendRequest: async (request, environment) => {
      seenScopes.push({
        requestId: request.id,
        scope: environment.variables.find((item) => item.key === 'scope')?.value,
        envOnly: environment.variables.find((item) => item.key === 'envOnly')?.value,
        collectionOnly: environment.variables.find((item) => item.key === 'collectionOnly')?.value,
        folderOnly: environment.variables.find((item) => item.key === 'folderOnly')?.value
      });
      return response(200, '{}');
    }
  });

  assert.deepEqual(seenScopes, [
    { requestId: 'root', scope: 'collection', envOnly: 'environment', collectionOnly: 'collection', folderOnly: undefined },
    { requestId: 'folder-fallback', scope: 'folder', envOnly: 'environment', collectionOnly: 'collection', folderOnly: 'folder' },
    { requestId: 'request-override', scope: 'request', envOnly: 'environment', collectionOnly: 'collection', folderOnly: 'folder' }
  ]);
});

test('honors pm.execution.setNextRequest during collection runs', async () => {
  const collection = collectionModel({
    name: 'Execution Control',
    requests: [
      requestModel({
        id: 'first',
        name: 'First',
        url: 'https://api.example.test/first',
        scripts: { tests: "pm.execution.setNextRequest('third');" }
      }),
      requestModel({
        id: 'second',
        name: 'Second',
        url: 'https://api.example.test/second'
      }),
      requestModel({
        id: 'third',
        name: 'Third',
        url: 'https://api.example.test/third',
        scripts: { tests: "pm.execution.setNextRequest(null);" }
      })
    ]
  });
  const seen = [];

  const result = await runCollection(collection, null, {
    sendRequest: async (request) => {
      seen.push(request.id);
      return response(200, '{}');
    }
  });

  assert.deepEqual(seen, ['first', 'third']);
  assert.equal(result.totalRequests, 2);
  assert.equal(result.passed, true);
});

test('runs pm.execution.runRequest through the collection broker', async () => {
  const collection = collectionModel({
    name: 'Run Request Broker',
    variables: [{ enabled: true, key: 'baseUrl', value: 'https://api.example.test' }],
    requests: [
      requestModel({
        id: 'root',
        name: 'Root',
        url: '{{baseUrl}}/root',
        scripts: {
          tests: `
            pm.environment.set('beforeRunRequest', 'from-root');
            pm.test('root can run another request', async function () {
              const response = await pm.execution.runRequest('target', {
                variables: { targetPath: 'from-override' }
              });
              pm.expect(response.code).to.equal(202);
              pm.expect(response.json().target).to.equal('from-override');
              pm.expect(pm.environment.get('fromTarget')).to.equal('yes');
            });
            pm.execution.setNextRequest(null);
          `
        }
      }),
      requestModel({
        id: 'target',
        name: 'Target',
        url: '{{baseUrl}}/{{targetPath}}',
        variables: [{ enabled: true, key: 'targetPath', value: 'default-target' }],
        scripts: {
          tests: `
            pm.test('target request tests are reported on caller', function () {
              pm.expect(pm.environment.get('beforeRunRequest')).to.equal('from-root');
              pm.expect(pm.response.code).to.equal(202);
            });
            pm.environment.set('fromTarget', 'yes');
            pm.execution.setNextRequest('should-not-affect-root');
          `
        }
      }),
      requestModel({
        id: 'should-not-run',
        name: 'Should Not Run',
        url: '{{baseUrl}}/should-not-run'
      })
    ]
  });
  const sent = [];

  const result = await runCollection(collection, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request, environment) => {
      sent.push({
        id: request.id,
        targetPath: environment.variables.find((item) => item.key === 'targetPath')?.value || '',
        beforeRunRequest: environment.variables.find((item) => item.key === 'beforeRunRequest')?.value || ''
      });
      if (request.id === 'target') {
        return response(202, '{"target":"from-override"}');
      }
      return response(200, '{"ok":true}');
    }
  });

  assert.equal(result.passed, true);
  assert.deepEqual(sent.map((item) => item.id), ['root', 'target']);
  assert.equal(sent[1].targetPath, 'from-override');
  assert.equal(sent[1].beforeRunRequest, 'from-root');
  assert.equal(result.totalRequests, 1);
  assert.equal(result.environment.variables.find((item) => item.key === 'fromTarget').value, 'yes');
  assert.ok(result.results[0].testScriptResult.tests.some((item) => item.name === 'Target: target request tests are reported on caller' && item.passed));
});

test('resolves pm.execution.runRequest request links against imported request IDs', async () => {
  const collection = collectionModel({
    id: 'collection-link-targets',
    name: 'Run Request Links',
    requests: [
      requestModel({
        id: 'root',
        name: 'Root',
        url: 'https://api.example.test/root',
        scripts: {
          tests: `
            pm.test('root can run a linked request', async function () {
              const response = await pm.execution.runRequest('https://www.postman.com/team/workspace/request/collection-postman-id/request-postman-uid?action=share&source=copy-link');
              pm.expect(response.code).to.equal(204);
            });
            pm.execution.setNextRequest(null);
          `
        }
      }),
      requestModel({
        id: 'regenerated-target-id',
        name: 'Target',
        url: 'https://api.example.test/target',
        postman: {
          ids: {
            original: 'request-postman-original',
            uid: 'request-postman-uid'
          }
        }
      })
    ]
  });
  const sent = [];

  const result = await runCollection(collection, null, {
    sendRequest: async (request) => {
      sent.push(request.id);
      return response(request.id === 'regenerated-target-id' ? 204 : 200, '');
    }
  });

  assert.equal(result.passed, true);
  assert.deepEqual(sent, ['root', 'regenerated-target-id']);
  assert.equal(result.totalRequests, 1);
});

test('runs pm.vault through collection scripts when the workspace grants access', async () => {
  const collection = collectionModel({
    name: 'Vault Collection',
    requests: [
      requestModel({
        id: 'vault-request',
        name: 'Vault Request',
        url: 'https://api.example.test/vault',
        scripts: {
          preRequest: `
            pm.test('stores vault secret', async function () {
              await pm.vault.set('collectionToken', 'stored');
            });
          `,
          tests: `
            pm.test('reads vault secret', async function () {
              pm.expect(await pm.vault.get('collectionToken')).to.equal('stored');
              await pm.vault.unset('collectionToken');
              pm.expect(await pm.vault.get('collectionToken')).to.be.undefined;
            });
          `
        }
      })
    ]
  });
  const vault = new MemoryVaultStore();

  const result = await runCollection(collection, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async () => response(200, '{}'),
    trustedCapabilities: { vault: true },
    vault
  });

  assert.equal(result.passed, true);
  assert.equal(await vault.get('collectionToken'), undefined);
});

test('propagates diagnostics callbacks into collection sandbox broker denials', async () => {
  const events = [];
  const collection = collectionModel({
    name: 'Diagnostic Denials',
    requests: [
      requestModel({
        id: 'root',
        name: 'Root',
        url: 'https://api.example.test/root',
        scripts: {
          preRequest: `
            pm.test('sendRequest denial is diagnosed', async function () {
              await pm.sendRequest('https://api.example.test/denied');
            });
          `
        }
      })
    ]
  });

  const sent = [];
  const result = await runCollection(collection, { id: 'env', name: 'Env', variables: [] }, {
    trustedCapabilities: { sendRequest: false },
    recordDiagnosticEvent: async (event) => {
      events.push(event);
    },
    sendRequest: async (request) => {
      sent.push(request.id);
      return response(200, '{}');
    }
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(result.passed, false);
  assert.deepEqual(sent, ['root']);
  assert.equal(result.results[0].statusCode, 200);
  assert.equal(result.results[0].preRequestScriptResult.tests[0].passed, false);
  assert.ok(events.some((event) => (
    event.type === 'sandbox.broker.denied'
      && event.failureCode === 'script_send_request_disabled'
      && event.fields.operation === 'pm.sendRequest'
  )));
});

test('returns null when pm.execution.runRequest targets a skipped request', async () => {
  const collection = collectionModel({
    name: 'Run Request Skip',
    requests: [
      requestModel({
        id: 'root',
        name: 'Root',
        url: 'https://api.example.test/root',
        scripts: {
          tests: `
            pm.test('skipped runRequest returns null', async function () {
              const response = await pm.execution.runRequest('skipped');
              pm.expect(response).to.be.null;
            });
            pm.execution.setNextRequest(null);
          `
        }
      }),
      requestModel({
        id: 'skipped',
        name: 'Skipped',
        url: 'https://api.example.test/skipped',
        scripts: { preRequest: 'pm.execution.skipRequest();' }
      })
    ]
  });
  const sent = [];

  const result = await runCollection(collection, null, {
    sendRequest: async (request) => {
      sent.push(request.id);
      return response(200, '{}');
    }
  });

  assert.equal(result.passed, true);
  assert.deepEqual(sent, ['root']);
  assert.equal(result.totalRequests, 1);
});

test('does not commit pm.execution.runRequest side effects when the caller phase aborts', async () => {
  const collection = collectionModel({
    name: 'Run Request Rollback',
    requests: [
      requestModel({
        id: 'root',
        name: 'Root',
        url: 'https://api.example.test/root',
        scripts: {
          tests: `
            pm.execution.runRequest('target');
            throw new Error('abort caller phase');
          `
        }
      }),
      requestModel({
        id: 'target',
        name: 'Target',
        url: 'https://api.example.test/target',
        scripts: {
          tests: "pm.environment.set('fromRolledBackTarget', 'should-not-commit');"
        }
      })
    ]
  });

  const result = await runCollection(collection, { id: 'env', name: 'Env', variables: [] }, {
    stopOnFailure: true,
    sendRequest: async () => response(200, '{}')
  });

  assert.equal(result.passed, false);
  assert.equal(result.results[0].error, '');
  assert.match(result.results[0].testScriptResult.error, /abort caller phase/);
  assert.equal(result.environment.variables.find((item) => item.key === 'fromRolledBackTarget'), undefined);
});

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': ['application/json'] },
    body,
    durationMillis: 12,
    responseBytes: Buffer.byteLength(body),
    finalUrl: 'https://api.example.test'
  };
}

function authForType(type) {
  switch (type) {
    case 'none':
      return { type: 'none' };
    case 'bearer':
      return { type, token: '{{AUTH_SECRET}}' };
    case 'basic':
      return { type, username: 'runner-user', password: '{{AUTH_SECRET}}' };
    case 'apiKey':
      return { type, location: 'header', key: 'X-API-Key', value: '{{AUTH_SECRET}}' };
    case 'cookie':
      return { type, value: 'sid={{AUTH_SECRET}}' };
    case 'oauth2':
      return { type, accessToken: '{{AUTH_SECRET}}', tokenType: 'Bearer' };
    case 'clientCertificate':
      return { type, certificateId: 'cert-1' };
    case 'digest':
      return { type, username: 'runner-user', password: '{{AUTH_SECRET}}' };
    case 'hawk':
      return { type, authId: 'hawk-id', authKey: '{{AUTH_SECRET}}', nonce: 'nonce', algorithm: 'sha256' };
    case 'aws':
      return { type, accessKey: 'AKIDEXAMPLE', secretKey: '{{AUTH_SECRET}}', region: 'us-east-1', service: 'execute-api' };
    case 'oauth1':
      return { type, consumerKey: 'consumer', consumerSecret: '{{AUTH_SECRET}}', token: 'token', tokenSecret: 'token-secret' };
    case 'ntlm':
      return { type, username: 'runner-user', password: '{{AUTH_SECRET}}', domain: 'POSTMETER', workstation: 'WORKSTATION' };
    case 'akamaiEdgeGrid':
      return { type, accessToken: '{{AUTH_SECRET}}', clientToken: 'client', clientSecret: 'secret', nonce: 'nonce' };
    case 'jwtBearer':
      return { type, algorithm: 'HS256', secret: '{{AUTH_SECRET}}', issuer: 'issuer', audience: 'audience' };
    case 'asap':
      return { type, algorithm: 'HS256', secret: '{{AUTH_SECRET}}', issuer: 'issuer', audience: 'audience' };
    default:
      throw new Error(`Unhandled auth type in refresh matrix: ${type}`);
  }
}
