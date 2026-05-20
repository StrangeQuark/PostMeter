const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createAuthRefreshManager,
  extractPath,
  jwtExpiresAtMillis,
  missingRefreshPathMessage,
  normalizeAuthRefreshConfig,
  requestWithAutoRefreshAuth,
  refreshExpiresAtMillis
} = require('../../src/core/http/authRefresh');

test('normalizes auth refresh config and nested refresh request', () => {
  const normalized = normalizeAuthRefreshConfig({
    enabled: true,
    mode: 'interval',
    targetScope: 'globals',
    accessTokenVariable: 'ACCESS_TOKEN',
    refreshTokenVariable: '',
    expiresAtVariable: 'ACCESS_TOKEN_EXPIRES_AT',
    refreshWindowSeconds: 90,
    refreshIntervalSeconds: 300,
    request: {
      name: 'Login',
      method: 'POST',
      url: 'https://auth.example.test/token',
      headers: [{ enabled: true, key: 'Content-Type', value: 'application/json' }],
      bodyType: 'RAW_JSON',
      body: '{"refresh":"{{REFRESH_TOKEN}}"}'
    },
    refreshTokenRequest: {
      name: 'Rotate Refresh Token',
      method: 'PUT',
      url: 'https://auth.example.test/refresh-token',
      headers: [{ enabled: true, key: 'X-Refresh', value: '{{REFRESH_TOKEN}}' }]
    }
  });

  assert.equal(normalized.enabled, true);
  assert.equal(normalized.mode, 'interval');
  assert.equal(normalized.authType, 'bearer');
  assert.equal(normalized.targetScope, 'globals');
  assert.equal(normalized.apiKeyLocation, 'header');
  assert.equal(normalized.apiKeyName, 'X-API-Key');
  assert.equal(normalized.refreshTokenVariable, '');
  assert.deepEqual(normalized.outputs.map((item) => [item.slot, item.source, item.path, item.variable]), [
    ['accessToken', 'body', 'access_token', 'ACCESS_TOKEN']
  ]);
  assert.equal(normalized.request.id, 'auth-refresh-request');
  assert.equal(normalized.request.name, 'Login');
  assert.equal(normalized.request.method, 'POST');
  assert.equal(normalized.request.headers[0].key, 'Content-Type');
  assert.equal(normalized.refreshTokenRequest.id, 'auth-refresh-token-request');
  assert.equal(normalized.refreshTokenRequest.name, 'Rotate Refresh Token');
  assert.equal(normalized.refreshTokenRequest.method, 'PUT');
  assert.equal(normalized.refreshTokenRequest.headers[0].key, 'X-Refresh');
});

test('refresh manager runs refresh-token request before access-token request when configured', async () => {
  const now = Date.parse('2026-04-27T12:00:00.000Z');
  const environment = {
    id: 'env',
    name: 'Env',
    variables: [{ enabled: true, key: 'REFRESH_TOKEN', value: 'refresh-1' }]
  };
  const sends = [];
  const manager = createAuthRefreshManager({
    enabled: true,
    mode: 'interval',
    accessTokenVariable: 'ACCESS_TOKEN',
    refreshTokenVariable: 'REFRESH_TOKEN',
    refreshBeforeRun: true,
    outputs: [
      { slot: 'accessToken', source: 'body', path: 'access_token', variable: 'ACCESS_TOKEN' },
      { slot: 'refreshToken', source: 'body', path: 'refresh_token', variable: 'REFRESH_TOKEN' }
    ],
    refreshTokenRequest: {
      id: 'refresh-token-request',
      name: 'Rotate Refresh Token',
      method: 'POST',
      url: 'https://auth.example.test/refresh-token'
    },
    request: {
      id: 'access-token-request',
      name: 'Get Access Token',
      method: 'POST',
      url: 'https://auth.example.test/access-token',
      bodyType: 'RAW_JSON',
      body: '{"refresh":"{{REFRESH_TOKEN}}"}'
    }
  }, {
    now: () => now,
    sendRequest: async (request, resolvedEnvironment) => {
      sends.push({
        id: request.id,
        refreshToken: resolvedEnvironment.variables.find((item) => item.key === 'REFRESH_TOKEN')?.value || ''
      });
      if (request.id === 'refresh-token-request') {
        return response(200, { refresh_token: 'refresh-2' });
      }
      return response(200, { access_token: 'access-2', expires_in: 600 });
    }
  });

  const result = await manager.beforeRun({ environment });

  assert.deepEqual(sends, [
    { id: 'refresh-token-request', refreshToken: 'refresh-1' },
    { id: 'access-token-request', refreshToken: 'refresh-2' }
  ]);
  assert.equal(variable(environment, 'REFRESH_TOKEN'), 'refresh-2');
  assert.equal(variable(environment, 'ACCESS_TOKEN'), 'access-2');
  assert.equal(result.stats.refreshCount, 1);
});

test('refresh manager can inject refreshed refresh tokens into the access-token auth request', async () => {
  const sends = [];
  const manager = createAuthRefreshManager({
    enabled: true,
    mode: 'interval',
    authType: 'bearer',
    refreshBeforeRun: true,
    outputs: [
      { slot: 'refreshToken', source: 'body', path: 'refresh_token', variable: '' },
      { slot: 'accessToken', source: 'body', path: 'access_token', variable: '' }
    ],
    refreshTokenRequest: {
      id: 'refresh-token-request',
      name: 'Rotate Refresh Token',
      method: 'POST',
      url: 'https://auth.example.test/refresh-token'
    },
    request: {
      id: 'access-token-request',
      name: 'Get Access Token',
      method: 'POST',
      url: 'https://auth.example.test/access-token',
      auth: { type: 'autoRefreshRefreshToken' }
    }
  }, {
    sendRequest: async (request) => {
      sends.push({ id: request.id, auth: request.auth });
      if (request.id === 'refresh-token-request') {
        return response(200, { refresh_token: 'refresh-2' });
      }
      return response(200, { access_token: 'access-2' });
    }
  });

  const result = await manager.beforeRun({ environment: { id: 'env', name: 'Env', variables: [] } });

  assert.deepEqual(sends, [
    { id: 'refresh-token-request', auth: { type: 'none' } },
    { id: 'access-token-request', auth: { type: 'bearer', token: 'refresh-2' } }
  ]);
  assert.deepEqual(result.autoRefreshAuth, { type: 'bearer', token: 'access-2' });
});

test('refresh manager can inject refreshed refresh cookies into the access-cookie auth request', async () => {
  const sends = [];
  const manager = createAuthRefreshManager({
    enabled: true,
    mode: 'interval',
    authType: 'cookie',
    refreshBeforeRun: true,
    outputs: [
      { slot: 'refreshToken', source: 'cookie', path: 'refresh_sid', variable: '' },
      { slot: 'cookie', source: 'cookie', path: 'access_sid', variable: '' }
    ],
    refreshTokenRequest: {
      id: 'refresh-cookie-request',
      name: 'Rotate Refresh Cookie',
      method: 'POST',
      url: 'https://auth.example.test/refresh-cookie'
    },
    request: {
      id: 'access-cookie-request',
      name: 'Get Access Cookie',
      method: 'POST',
      url: 'https://auth.example.test/access-cookie',
      auth: { type: 'autoRefreshRefreshToken' }
    }
  }, {
    sendRequest: async (request, _environment, options = {}) => {
      sends.push({
        id: request.id,
        auth: request.auth,
        cookieJar: (options.cookieJar || []).map((cookie) => `${cookie.name}=${cookie.value}`),
        cookieJarEnabled: request.cookieJar?.enabled === true
      });
      if (request.id === 'refresh-cookie-request') {
        return {
          ...response(200, {}),
          updatedCookies: [{ enabled: true, name: 'refresh_sid', value: 'refresh-cookie-2', domain: 'example.test', path: '/' }]
        };
      }
      return {
        ...response(200, {}),
        updatedCookies: [
          { enabled: true, name: 'refresh_sid', value: 'refresh-cookie-2', domain: 'example.test', path: '/' },
          { enabled: true, name: 'access_sid', value: 'access-cookie-2', domain: 'example.test', path: '/' }
        ]
      };
    }
  });

  const result = await manager.beforeRun({
    environment: { id: 'env', name: 'Env', variables: [] },
    cookies: []
  });

  assert.deepEqual(sends, [
    { id: 'refresh-cookie-request', auth: { type: 'none' }, cookieJar: [], cookieJarEnabled: false },
    {
      id: 'access-cookie-request',
      auth: { type: 'none' },
      cookieJar: ['refresh_sid=refresh-cookie-2', 'refresh_sid=refresh-cookie-2'],
      cookieJarEnabled: true
    }
  ]);
  assert.deepEqual(result.autoRefreshAuth, { type: 'cookie', value: 'access_sid=access-cookie-2' });
});

test('refresh manager saves typed outputs from body headers and cookies', async () => {
  const environment = { id: 'env', name: 'Env', variables: [] };
  const manager = createAuthRefreshManager({
    enabled: true,
    mode: 'interval',
    authType: 'aws',
    accessTokenVariable: 'AWS_ACCESS_KEY_ID',
    refreshBeforeRun: true,
    outputs: [
      { slot: 'awsAccessKey', source: 'body', path: 'credentials.accessKeyId', variable: 'AWS_ACCESS_KEY_ID' },
      { slot: 'awsSecretKey', source: 'body', path: 'credentials.secretAccessKey', variable: 'AWS_SECRET_ACCESS_KEY' },
      { slot: 'custom', source: 'header', path: 'x-csrf-token', variable: 'CSRF_TOKEN' },
      { slot: 'cookie', source: 'cookie', path: 'sid', variable: 'SESSION_COOKIE' }
    ],
    request: { method: 'POST', url: 'https://auth.example.test/token' }
  }, {
    sendRequest: async () => ({
      ...response(200, {
        credentials: {
          accessKeyId: 'AKIA_REFRESHED',
          secretAccessKey: 'secret-refreshed'
        }
      }),
      headers: { 'x-csrf-token': ['csrf-refreshed'] },
      updatedCookies: [{ enabled: true, name: 'sid', value: 'cookie-refreshed', domain: 'example.test', path: '/' }]
    })
  });

  await manager.beforeRun({ environment, cookies: [] });

  assert.equal(variable(environment, 'AWS_ACCESS_KEY_ID'), 'AKIA_REFRESHED');
  assert.equal(variable(environment, 'AWS_SECRET_ACCESS_KEY'), 'secret-refreshed');
  assert.equal(variable(environment, 'CSRF_TOKEN'), 'csrf-refreshed');
  assert.equal(variable(environment, 'SESSION_COOKIE'), 'cookie-refreshed');
});

test('refresh manager exposes bearer API key and cookie values for automatic auth injection without variables', async () => {
  const bearerManager = createAuthRefreshManager({
    enabled: true,
    authType: 'bearer',
    mode: 'interval',
    refreshBeforeRun: true,
    outputs: [{ slot: 'accessToken', source: 'body', path: 'jwtToken', variable: '' }],
    request: { method: 'POST', url: 'https://auth.example.test/token' }
  }, {
    sendRequest: async () => response(200, { jwtToken: 'bearer-auto-token' })
  });
  const bearerSnapshot = await bearerManager.beforeRun({ environment: { id: 'env', name: 'Env', variables: [] } });

  assert.deepEqual(bearerSnapshot.autoRefreshAuth, { type: 'bearer', token: 'bearer-auto-token' });
  assert.deepEqual(requestWithAutoRefreshAuth(
    { id: 'resource', auth: { type: 'autoRefresh' } },
    { enabled: true, authType: 'bearer' },
    bearerSnapshot.autoRefreshAuth
  ).auth, { type: 'bearer', token: 'bearer-auto-token' });

  const apiKeyManager = createAuthRefreshManager({
    enabled: true,
    authType: 'apiKey',
    apiKeyLocation: 'query',
    apiKeyName: 'api_key',
    mode: 'interval',
    refreshBeforeRun: true,
    outputs: [{ slot: 'apiKey', source: 'body', path: 'apiKey', variable: '' }],
    request: { method: 'POST', url: 'https://auth.example.test/api-key' }
  }, {
    sendRequest: async () => response(200, { apiKey: 'api-auto-token' })
  });
  const apiKeySnapshot = await apiKeyManager.beforeRun({ environment: { id: 'env', name: 'Env', variables: [] } });

  assert.deepEqual(apiKeySnapshot.autoRefreshAuth, {
    type: 'apiKey',
    location: 'query',
    key: 'api_key',
    value: 'api-auto-token'
  });
  assert.deepEqual(requestWithAutoRefreshAuth(
    { id: 'resource', auth: { type: 'autoRefresh' } },
    { enabled: true, authType: 'apiKey', apiKeyLocation: 'query', apiKeyName: 'api_key' },
    apiKeySnapshot.autoRefreshAuth
  ).auth, {
    type: 'apiKey',
    location: 'query',
    key: 'api_key',
    value: 'api-auto-token'
  });

  const cookieManager = createAuthRefreshManager({
    enabled: true,
    authType: 'cookie',
    mode: 'interval',
    refreshBeforeRun: true,
    outputs: [{ slot: 'cookie', source: 'cookie', path: 'sid', variable: '' }],
    request: { method: 'POST', url: 'https://auth.example.test/session' }
  }, {
    sendRequest: async () => ({
      ...response(200, {}),
      updatedCookies: [{ enabled: true, name: 'sid', value: 'cookie-auto-token', domain: 'example.test', path: '/' }]
    })
  });
  const cookieSnapshot = await cookieManager.beforeRun({ environment: { id: 'env', name: 'Env', variables: [] }, cookies: [] });

  assert.deepEqual(cookieSnapshot.autoRefreshAuth, { type: 'cookie', value: 'sid=cookie-auto-token' });
  assert.deepEqual(requestWithAutoRefreshAuth(
    { id: 'resource', auth: { type: 'cookie', value: 'sid=stale' } },
    { enabled: true, authType: 'cookie' },
    cookieSnapshot.autoRefreshAuth
  ), {
    id: 'resource',
    auth: { type: 'none' },
    cookieJar: { enabled: true, storeResponses: true }
  });
});

test('refresh manager can read refreshed tokens from the entire response body', async () => {
  const bearerManager = createAuthRefreshManager({
    enabled: true,
    authType: 'bearer',
    mode: 'interval',
    refreshBeforeRun: true,
    outputs: [{ slot: 'accessToken', source: 'rawBody', path: '', variable: 'ACCESS_TOKEN' }],
    request: { method: 'POST', url: 'https://auth.example.test/token' }
  }, {
    sendRequest: async () => textResponse(200, 'raw-access-token')
  });
  const environment = { id: 'env', name: 'Env', variables: [] };
  const bearerSnapshot = await bearerManager.beforeRun({ environment });

  assert.equal(variable(environment, 'ACCESS_TOKEN'), 'raw-access-token');
  assert.deepEqual(bearerSnapshot.autoRefreshAuth, { type: 'bearer', token: 'raw-access-token' });

  const refreshManager = createAuthRefreshManager({
    enabled: true,
    authType: 'bearer',
    mode: 'interval',
    refreshBeforeRun: true,
    outputs: [
      { slot: 'refreshToken', source: 'rawBody', path: '', variable: '' },
      { slot: 'accessToken', source: 'body', path: 'access_token', variable: '' }
    ],
    refreshTokenRequest: { id: 'refresh-token-request', method: 'POST', url: 'https://auth.example.test/refresh-token' },
    request: {
      id: 'access-token-request',
      method: 'POST',
      url: 'https://auth.example.test/access-token',
      auth: { type: 'autoRefreshRefreshToken' }
    }
  }, {
    sendRequest: async (request) => {
      if (request.id === 'refresh-token-request') {
        return textResponse(200, 'raw-refresh-token');
      }
      assert.deepEqual(request.auth, { type: 'bearer', token: 'raw-refresh-token' });
      return response(200, { access_token: 'access-from-refresh-token' });
    }
  });

  const refreshSnapshot = await refreshManager.beforeRun({ environment: { id: 'env-2', name: 'Env', variables: [] } });

  assert.deepEqual(refreshSnapshot.autoRefreshAuth, { type: 'bearer', token: 'access-from-refresh-token' });
});

test('extracts nested refresh response fields and JWT expiration', () => {
  const token = unsignedJwt({ exp: 1777291260, sub: 'user' });
  assert.equal(extractPath({ data: { tokens: [{ access: 'a' }] } }, 'data.tokens[0].access'), 'a');
  assert.equal(extractPath({ data: { tokens: [{ access: 'a' }] } }, 'data.tokens[1].access'), undefined);
  assert.equal(jwtExpiresAtMillis(token), 1777291260000);
  assert.equal(
    refreshExpiresAtMillis({ expiresIn: 60, now: Date.parse('2026-04-27T12:00:00.000Z') }),
    Date.parse('2026-04-27T12:01:00.000Z')
  );
});

test('refresh manager updates runtime variables from refresh response', async () => {
  const now = Date.parse('2026-04-27T12:00:00.000Z');
  const environment = {
    id: 'env',
    name: 'Env',
    variables: [{ enabled: true, key: 'refreshToken', value: 'refresh-1' }]
  };
  const sends = [];
  const manager = createAuthRefreshManager({
    enabled: true,
    mode: 'auto',
    targetScope: 'environment',
    accessTokenVariable: 'token',
    refreshTokenVariable: 'refreshToken',
    expiresAtVariable: 'expiresAt',
    refreshWindowSeconds: 120,
    request: {
      method: 'POST',
      url: 'https://auth.example.test/token',
      headers: [{ enabled: true, key: 'Content-Type', value: 'application/json' }],
      bodyType: 'RAW_JSON',
      body: '{"refresh":"{{refreshToken}}"}'
    }
  }, {
    now: () => now,
    sendRequest: async (request, resolvedEnvironment) => {
      sends.push({
        url: request.url,
        refreshToken: resolvedEnvironment.variables.find((item) => item.key === 'refreshToken')?.value
      });
      return response(200, {
        access_token: 'fresh-access',
        refresh_token: 'refresh-2',
        expires_in: 600
      });
    }
  });

  const result = await manager.beforeRun({ environment });

  assert.equal(sends.length, 1);
  assert.equal(sends[0].refreshToken, 'refresh-1');
  assert.equal(variable(environment, 'token'), 'fresh-access');
  assert.equal(variable(environment, 'refreshToken'), 'refresh-2');
  assert.equal(variable(environment, 'expiresAt'), '2026-04-27T12:10:00.000Z');
  assert.equal(result.stats.refreshCount, 1);
});

test('refresh manager refreshes JWTs inside the configured window only', async () => {
  const now = Date.parse('2026-04-27T12:00:00.000Z');
  const environment = {
    id: 'env',
    name: 'Env',
    variables: [{ enabled: true, key: 'token', value: unsignedJwt({ exp: Math.floor((now + 30_000) / 1000) }) }]
  };
  let refreshCalls = 0;
  const manager = createAuthRefreshManager({
    enabled: true,
    mode: 'auto',
    accessTokenVariable: 'token',
    refreshWindowSeconds: 120,
    request: { method: 'POST', url: 'https://auth.example.test/token' }
  }, {
    now: () => now,
    sendRequest: async () => {
      refreshCalls += 1;
      return response(200, {
        access_token: unsignedJwt({ exp: Math.floor((now + 900_000) / 1000) }),
        expires_in: 900
      });
    }
  });

  await manager.ensureFresh({ environment });
  await manager.ensureFresh({ environment });

  assert.equal(refreshCalls, 1);
  assert.equal(manager.stats().refreshCount, 1);
});

test('refresh manager schedules interval and lifetime modes from run start when pre-run refresh is disabled', async () => {
  const started = Date.parse('2026-04-27T12:00:00.000Z');
  for (const mode of ['interval', 'lifetime']) {
    let now = started;
    let refreshCalls = 0;
    const environment = {
      id: `env-${mode}`,
      name: 'Env',
      variables: [{ enabled: true, key: 'token', value: `${mode}-initial-token` }]
    };
    const manager = createAuthRefreshManager({
      enabled: true,
      mode,
      accessTokenVariable: 'token',
      refreshBeforeRun: false,
      refreshIntervalSeconds: 300,
      tokenLifetimeSeconds: 600,
      refreshWindowSeconds: 120,
      request: { method: 'POST', url: 'https://auth.example.test/token' }
    }, {
      now: () => now,
      sendRequest: async () => {
        refreshCalls += 1;
        return response(200, { access_token: `${mode}-fresh-token`, expires_in: 600 });
      }
    });

    await manager.beforeRun({ environment });
    await manager.ensureFresh({ environment });
    assert.equal(refreshCalls, 0);

    now = started + (mode === 'interval' ? 299_000 : 479_000);
    await manager.ensureFresh({ environment });
    assert.equal(refreshCalls, 0);

    now = started + (mode === 'interval' ? 300_000 : 480_000);
    await manager.ensureFresh({ environment });
    assert.equal(refreshCalls, 1);
    assert.equal(variable(environment, 'token'), `${mode}-fresh-token`);
  }
});

test('refresh manager coalesces concurrent refresh attempts', async () => {
  const environment = { id: 'env', name: 'Env', variables: [] };
  let refreshCalls = 0;
  const manager = createAuthRefreshManager({
    enabled: true,
    mode: 'interval',
    accessTokenVariable: 'token',
    refreshBeforeRun: false,
    request: { method: 'POST', url: 'https://auth.example.test/token' }
  }, {
    sendRequest: async () => {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return response(200, { access_token: 'shared-token', expires_in: 600 });
    }
  });

  await Promise.all(Array.from({ length: 8 }, () => manager.ensureFresh({ environment })));

  assert.equal(refreshCalls, 1);
  assert.equal(variable(environment, 'token'), 'shared-token');
});

test('refresh manager can continue after refresh failure when configured', async () => {
  const environment = { id: 'env', name: 'Env', variables: [{ enabled: true, key: 'token', value: '' }] };
  const manager = createAuthRefreshManager({
    enabled: true,
    failurePolicy: 'continue',
    request: { method: 'POST', url: 'https://auth.example.test/token' }
  }, {
    sendRequest: async () => {
      throw new Error('provider unavailable');
    }
  });

  const result = await manager.ensureFresh({ environment });

  assert.equal(result.refreshed, false);
  assert.match(result.error, /provider unavailable/);
  assert.equal(manager.stats().lastError, 'provider unavailable');
});

test('missing refresh path errors list response keys without leaking response values', async () => {
  const message = missingRefreshPathMessage('jwtToken', {
    statusCode: 401,
    body: JSON.stringify({
      error: 'missing_refresh_cookie',
      accessToken: 'secret-access',
      refresh_token: 'secret-refresh',
      nested: { ignored: true }
    })
  }, {
    error: 'missing_refresh_cookie',
    accessToken: 'secret-access',
    refresh_token: 'secret-refresh',
    nested: { ignored: true }
  });

  assert.equal(message, [
    'Auth refresh response did not include "jwtToken".',
    '',
    'Response keys:',
    'error',
    'accessToken',
    'refresh_token',
    'nested'
  ].join('\n'));
  assert.doesNotMatch(message, /Status 401/);
  assert.doesNotMatch(message, /missing_refresh_cookie/);
  assert.doesNotMatch(message, /secret-access/);
  assert.doesNotMatch(message, /secret-refresh/);
});

test('refresh manager wraps aborting send failures with refreshing auth context', async () => {
  const manager = createAuthRefreshManager({
    enabled: true,
    mode: 'interval',
    refreshBeforeRun: true,
    request: {
      id: 'access-token-request',
      name: 'Get Access Token',
      method: 'POST',
      url: 'http://127.0.0.1:65535/token'
    }
  }, {
    sendRequest: async () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:65535');
      error.code = 'ECONNREFUSED';
      throw error;
    }
  });

  await assert.rejects(
    manager.beforeRun({ environment: { id: 'env', name: 'Env', variables: [] } }),
    (error) => {
      assert.match(error.message, /^Refreshing Auth failed: connect ECONNREFUSED 127\.0\.0\.1:65535$/);
      assert.equal(error.code, 'ECONNREFUSED');
      return true;
    }
  );
  assert.equal(manager.stats().lastError, 'connect ECONNREFUSED 127.0.0.1:65535');
});

test('refresh manager wraps missing auth request URL before a run starts', async () => {
  const manager = createAuthRefreshManager({
    enabled: true,
    mode: 'interval',
    refreshBeforeRun: true,
    request: {
      id: 'access-token-request',
      name: 'Get Access Token',
      method: 'POST',
      url: ''
    }
  });

  await assert.rejects(
    manager.beforeRun({ environment: { id: 'env', name: 'Env', variables: [] } }),
    /Refreshing Auth failed: Auth refresh request URL is required\./
  );
  assert.equal(manager.stats().lastError, 'Auth refresh request URL is required.');
});

function response(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': ['application/json'] },
    body: JSON.stringify(payload),
    durationMillis: 1,
    responseBytes: Buffer.byteLength(JSON.stringify(payload), 'utf8'),
    finalUrl: 'https://auth.example.test/token'
  };
}

function textResponse(statusCode, body) {
  const text = String(body || '');
  return {
    statusCode,
    headers: { 'content-type': ['text/plain'] },
    body: text,
    durationMillis: 1,
    responseBytes: Buffer.byteLength(text, 'utf8'),
    finalUrl: 'https://auth.example.test/token'
  };
}

function variable(environment, key) {
  return environment.variables.find((item) => item.key === key)?.value || '';
}

function unsignedJwt(payload) {
  return [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    ''
  ].join('.');
}
