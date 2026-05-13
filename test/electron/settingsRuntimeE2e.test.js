const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { LocalDiagnosticsLogger } = require('../../src/core/diagnostics');
const { normalizeSettings } = require('../../src/core/models');
const { runRequestWithScripts } = require('../../src/core/requestScriptRunner');
const { fetchSandboxPackageForReview } = require('../../src/core/sandboxPackageFetcher');
const { scriptPackageBundleIntegrity } = require('../../src/core/scriptRuntime');
const {
  EncryptedVaultStore,
  MemoryVaultStore
} = require('../../src/core/vaultStore');

function response(statusCode, body, finalUrl) {
  return {
    statusCode,
    headers: { 'content-type': ['text/plain'] },
    body: String(body || ''),
    durationMillis: 1,
    responseBytes: Buffer.byteLength(String(body || ''), 'utf8'),
    finalUrl
  };
}

function requestWithScript(script) {
  return {
    id: 'settings-runtime-request',
    name: 'Settings Runtime Request',
    method: 'GET',
    url: 'https://api.example.test/main',
    queryParams: [],
    headers: [],
    bodyType: 'NONE',
    body: '',
    auth: { type: 'none' },
    variables: [],
    scripts: {
      preRequest: script,
      tests: `
        pm.test('main request completed', function () {
          pm.expect(pm.response.code).to.equal(200);
        });
      `
    }
  };
}

function emptyEnvironment() {
  return {
    id: 'settings-runtime-env',
    name: 'Settings Runtime Env',
    variables: []
  };
}

function runtimeOptions(settings, overrides = {}) {
  return {
    trustedCapabilities: settings.sandbox.trustedCapabilities,
    sandboxPackages: settings.sandbox.packageCache,
    fileBindings: settings.sandbox.fileBindings,
    sendRequest: async (request) => response(200, 'main response', request.url),
    ...overrides
  };
}

test('settings script capabilities drive network, cookie, and vault access during request execution', async () => {
  const settings = normalizeSettings({
    sandbox: {
      trustedCapabilities: {
        sendRequest: true,
        cookies: true,
        vault: true,
        vaultGrants: { workspace: true }
      }
    }
  });
  const vault = new MemoryVaultStore({ apiToken: 'vault-secret' });
  const sentUrls = [];
  const result = await runRequestWithScripts(
    requestWithScript(`
      pm.test('network setting enables brokered pm.sendRequest', async function () {
        const nested = await pm.sendRequest('https://api.example.test/nested');
        pm.expect(nested.code).to.equal(204);
      });
      pm.test('cookie setting enables pm.cookies', async function () {
        pm.expect(pm.cookies.get('visible')).to.equal('cookie-value');
        await pm.cookies.set('scripted', 'yes');
      });
      pm.test('vault setting enables pm.vault', async function () {
        pm.expect(await pm.vault.get('apiToken')).to.equal('vault-secret');
        await pm.vault.set('fromScript', 'saved-by-script');
      });
    `),
    emptyEnvironment(),
    runtimeOptions(settings, {
      cookieJar: [
        { enabled: true, name: 'visible', value: 'cookie-value', domain: 'api.example.test', path: '/', secure: false, httpOnly: false, sameSite: 'Lax', hostOnly: true }
      ],
      vault,
      sendRequest: async (request) => {
        sentUrls.push(request.url);
        if (request.url === 'https://api.example.test/nested') {
          return response(204, 'nested response', request.url);
        }
        return response(200, 'main response', request.url);
      }
    })
  );

  assert.equal(result.preRequestScriptResult.passed, true);
  assert.equal(result.response.testScriptResult.passed, true);
  assert.deepEqual(sentUrls, ['https://api.example.test/nested', 'https://api.example.test/main']);
  assert.equal(result.cookies.find((item) => item.name === 'scripted')?.value, 'yes');
  assert.equal(await vault.get('fromScript'), 'saved-by-script');
});

test('disabled script settings fail closed without allowing the disabled broker operation', async () => {
  const cases = [
    {
      name: 'network',
      settings: normalizeSettings({ sandbox: { trustedCapabilities: { sendRequest: false, cookies: true, vault: true } } }),
      script: `
        pm.test('network is disabled', async function () {
          await pm.sendRequest('https://api.example.test/denied');
        });
      `,
      errorPattern: /pm\.sendRequest is disabled/,
      deniedUrl: 'https://api.example.test/denied'
    },
    {
      name: 'cookies',
      settings: normalizeSettings({ sandbox: { trustedCapabilities: { sendRequest: true, cookies: false, vault: true } } }),
      script: `
        pm.test('cookies are disabled', async function () {
          await pm.cookies.get('visible');
        });
      `,
      errorPattern: /pm\.cookies is disabled/
    },
    {
      name: 'vault',
      settings: normalizeSettings({ sandbox: { trustedCapabilities: { sendRequest: true, cookies: true, vault: false } } }),
      script: `
        pm.test('vault is disabled', async function () {
          await pm.vault.get('apiToken');
        });
      `,
      errorPattern: /pm\.vault is disabled/
    }
  ];

  for (const scenario of cases) {
    const sentUrls = [];
    const result = await runRequestWithScripts(
      requestWithScript(scenario.script),
      emptyEnvironment(),
      runtimeOptions(scenario.settings, {
        cookieJar: [
          { enabled: true, name: 'visible', value: 'cookie-value', domain: 'api.example.test', path: '/', secure: false, httpOnly: false, sameSite: 'Lax', hostOnly: true }
        ],
        vault: new MemoryVaultStore({ apiToken: 'vault-secret' }),
        sendRequest: async (request) => {
          sentUrls.push(request.url);
          return response(200, 'main response', request.url);
        }
      })
    );

    assert.equal(result.preRequestScriptResult.passed, false, `${scenario.name} disabled should fail the pre-request test.`);
    assert.match(result.preRequestScriptResult.tests[0].error, scenario.errorPattern);
    assert.equal(result.response.statusCode, 200, `${scenario.name} disabled should still allow the primary request after a failed pm.test assertion.`);
    if (scenario.deniedUrl) {
      assert.equal(sentUrls.includes(scenario.deniedUrl), false, `${scenario.name} disabled should not broker the denied nested request.`);
    }
  }
});

test('reviewed package settings are used by pre-request and post-request scripts and missing packages fail closed', async () => {
  const packageSource = 'module.exports = { decorate(value) { return `reviewed-${value}`; } };';
  const packageFiles = [{ path: 'index.js', source: packageSource }];
  const packageIntegrity = scriptPackageBundleIntegrity({
    entrypoint: 'index.js',
    files: packageFiles,
    packageJson: {}
  });
  const settings = normalizeSettings({
    sandbox: {
      packageCache: [{
        entrypoint: 'index.js',
        files: packageFiles,
        specifier: 'npm:settings-e2e@1.0.0',
        source: packageSource,
        integrity: packageIntegrity,
        reviewedAt: '2026-01-01T00:00:00.000Z'
      }]
    }
  });
  const request = requestWithScript(`
    const tools = pm.require('npm:settings-e2e@1.0.0');
    pm.environment.set('packageResult', tools.decorate('ok'));
  `);
  request.scripts.tests = `
    const tools = pm.require('npm:settings-e2e@1.0.0');
    pm.test('reviewed package is available after response', function () {
      pm.expect(tools.decorate('post')).to.equal('reviewed-post');
      pm.expect(pm.environment.get('packageResult')).to.equal('reviewed-ok');
    });
  `;

  const result = await runRequestWithScripts(request, emptyEnvironment(), runtimeOptions(settings));
  assert.equal(result.preRequestScriptResult.passed, true);
  assert.equal(result.response.testScriptResult.passed, true);
  assert.equal(result.environment.variables.find((item) => item.key === 'packageResult')?.value, 'reviewed-ok');

  const missing = await runRequestWithScripts(
    requestWithScript("pm.require('npm:settings-e2e@1.0.0');"),
    emptyEnvironment(),
    runtimeOptions(normalizeSettings({ sandbox: { packageCache: [] } }))
  );
  assert.equal(missing.preRequestScriptResult.passed, false);
  assert.match(missing.preRequestScriptResult.error, /not installed in the reviewed package cache/);
});

test('live npm reviewed package import works through fetch review and request script execution', { timeout: 45_000 }, async () => {
  const fetched = await fetchSandboxPackageForReview('npm:left-pad@1.3.0');
  assert.equal(fetched.specifier, 'npm:left-pad@1.3.0');
  assert.equal(fetched.registry, 'npm');
  assert.equal(fetched.packageName, 'left-pad');
  assert.equal(fetched.packageVersion, '1.3.0');
  assert.equal(fetched.entrypoint, 'index.js');
  assert.ok(fetched.files.some((file) => file.path === 'index.js'));
  assert.ok(fetched.source.includes('module.exports = leftPad'));

  const settings = normalizeSettings({
    sandbox: {
      packageCache: [fetched],
      trustedCapabilities: {
        sendRequest: true,
        cookies: true,
        vault: true
      }
    }
  });
  const request = requestWithScript(`
    const leftPad = pm.require('npm:left-pad@1.3.0');
    pm.environment.set('paddedId', leftPad('7', 3, '0'));
  `);
  request.scripts.tests = `
    const leftPad = pm.require('npm:left-pad@1.3.0');
    pm.test('real npm package runs after review', function () {
      pm.expect(leftPad('ok', 5, '.')).to.equal('...ok');
      pm.expect(pm.environment.get('paddedId')).to.equal('007');
    });
  `;

  let mainRequestSends = 0;
  const result = await runRequestWithScripts(request, emptyEnvironment(), runtimeOptions(settings, {
    sendRequest: async (sentRequest) => {
      mainRequestSends += 1;
      return response(200, 'main response', sentRequest.url);
    }
  }));

  assert.equal(result.preRequestScriptResult.passed, true);
  assert.equal(result.response.testScriptResult.passed, true);
  assert.equal(result.environment.variables.find((item) => item.key === 'paddedId')?.value, '007');
  assert.equal(mainRequestSends, 1);
});

test('file binding settings allow reviewed script file uploads and reject unbound local paths', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-settings-files-'));
  t.after(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });
  const localPath = path.join(directory, 'upload.txt');
  await fs.writeFile(localPath, 'BOUND_UPLOAD');
  const settings = normalizeSettings({
    sandbox: {
      fileBindings: [{
        source: 'fixtures/upload.txt',
        localPath,
        contentType: 'text/plain',
        reviewedAt: '2026-01-01T00:00:00.000Z'
      }]
    }
  });
  const uploadScript = `
    pm.test('bound file and form-data references are brokered', async function () {
      const first = await pm.sendRequest({
        method: 'POST',
        url: 'https://api.example.test/file',
        body: { mode: 'binary', binary: { src: 'fixtures/upload.txt', contentType: 'text/plain' } }
      });
      const second = await pm.sendRequest({
        method: 'POST',
        url: 'https://api.example.test/form',
        body: {
          mode: 'formdata',
          formdata: [
            { key: 'note', value: 'ok', type: 'text' },
            { key: 'payload', src: 'fixtures/upload.txt', type: 'file', contentType: 'text/plain' }
          ]
        }
      });
      pm.expect(first.code).to.equal(200);
      pm.expect(second.code).to.equal(200);
    });
  `;
  const sent = [];
  const result = await runRequestWithScripts(
    requestWithScript(uploadScript),
    emptyEnvironment(),
    runtimeOptions(settings, {
      trustedCapabilities: { sendRequest: true },
      sendRequest: async (request, _environment, options = {}) => {
        sent.push({ request, options });
        return response(200, 'upload response', request.url);
      }
    })
  );

  assert.equal(result.preRequestScriptResult.passed, true);
  assert.equal(sent[0].request.bodyAttachment.source, 'fixtures/upload.txt');
  assert.equal(sent[0].request.bodyAttachment.contentType, 'text/plain');
  assert.equal(sent[0].options.fileBindings[0].localPath, localPath);
  assert.equal(sent[1].request.multipart.parts[0].type, 'text');
  assert.equal(sent[1].request.multipart.parts[1].source, 'fixtures/upload.txt');

  const unboundSent = [];
  const unbound = await runRequestWithScripts(
    requestWithScript(`
      pm.test('unbound files fail closed', async function () {
        await pm.sendRequest({
          method: 'POST',
          url: 'https://api.example.test/unbound-file',
          body: { mode: 'file', file: { src: '/etc/passwd' } }
        });
      });
    `),
    emptyEnvironment(),
    runtimeOptions(normalizeSettings({ sandbox: { fileBindings: [] } }), {
      trustedCapabilities: { sendRequest: true },
      sendRequest: async (request) => {
        unboundSent.push(request.url);
        return response(200, 'main response', request.url);
      }
    })
  );

  assert.equal(unbound.preRequestScriptResult.passed, false);
  assert.match(unbound.preRequestScriptResult.tests[0].error, /File attachment binding is required/);
  assert.equal(unboundSent.includes('https://api.example.test/unbound-file'), false);
});

test('file binding settings read real local files and upload them through the request runtime', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-settings-real-files-'));
  t.after(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });
  const localPath = path.join(directory, 'runtime-upload.txt');
  await fs.writeFile(localPath, 'REAL_FILE_UPLOAD');
  const observed = [];
  const server = await createServer(async (incoming, outgoing) => {
    const chunks = [];
    for await (const chunk of incoming) {
      chunks.push(chunk);
    }
    observed.push({
      body: Buffer.concat(chunks).toString('utf8'),
      contentType: incoming.headers['content-type'] || '',
      path: incoming.url
    });
    outgoing.setHeader('Content-Type', 'application/json');
    outgoing.end(JSON.stringify({ ok: true, path: incoming.url }));
  });
  t.after(async () => {
    await server.close();
  });

  const settings = normalizeSettings({
    sandbox: {
      fileBindings: [{
        source: 'fixtures/runtime-upload.txt',
        localPath,
        contentType: 'text/plain',
        fileName: 'runtime-upload.txt',
        reviewedAt: '2026-01-01T00:00:00.000Z'
      }],
      trustedCapabilities: {
        sendRequest: true,
        cookies: true,
        vault: true
      }
    }
  });
  const request = requestWithScript(`
    pm.test('bound binary and form-data files upload real file bytes', async function () {
      const binary = await pm.sendRequest({
        method: 'POST',
        url: ${JSON.stringify(`${server.baseUrl}/binary`)},
        body: { mode: 'binary', binary: { src: 'fixtures/runtime-upload.txt', contentType: 'text/plain' } }
      });
      const form = await pm.sendRequest({
        method: 'POST',
        url: ${JSON.stringify(`${server.baseUrl}/form`)},
        body: {
          mode: 'formdata',
          formdata: [
            { key: 'note', value: 'hello', type: 'text' },
            { key: 'payload', src: 'fixtures/runtime-upload.txt', type: 'file', contentType: 'text/plain' }
          ]
        }
      });
      pm.expect(binary.code).to.equal(200);
      pm.expect(form.code).to.equal(200);
    });
  `);
  request.url = `${server.baseUrl}/main`;

  const result = await runRequestWithScripts(request, emptyEnvironment(), {
    fileBindings: settings.sandbox.fileBindings,
    sandboxPackages: settings.sandbox.packageCache,
    trustedCapabilities: settings.sandbox.trustedCapabilities
  });
  assert.equal(result.preRequestScriptResult.passed, true);
  assert.equal(result.response.statusCode, 200);
  assert.deepEqual(observed.map((item) => item.path), ['/binary', '/form', '/main']);
  assert.equal(observed[0].body, 'REAL_FILE_UPLOAD');
  assert.equal(observed[0].contentType, 'text/plain');
  assert.match(observed[1].contentType, /^multipart\/form-data; boundary=/);
  assert.match(observed[1].body, /name="note"\r\n\r\nhello/);
  assert.match(observed[1].body, /filename="runtime-upload.txt"/);
  assert.match(observed[1].body, /Content-Type: text\/plain/);
  assert.match(observed[1].body, /REAL_FILE_UPLOAD/);

  observed.length = 0;
  const denied = requestWithScript(`
    pm.test('unbound file upload is blocked before HTTP send', async function () {
      await pm.sendRequest({
        method: 'POST',
        url: ${JSON.stringify(`${server.baseUrl}/denied`)},
        body: { mode: 'file', file: { src: '/etc/passwd' } }
      });
    });
  `);
  denied.url = `${server.baseUrl}/main-after-denied`;
  const deniedSettings = normalizeSettings({
    sandbox: {
      fileBindings: [],
      trustedCapabilities: { sendRequest: true, cookies: true, vault: true }
    }
  });
  const deniedResult = await runRequestWithScripts(
    denied,
    emptyEnvironment(),
    {
      fileBindings: deniedSettings.sandbox.fileBindings,
      sandboxPackages: deniedSettings.sandbox.packageCache,
      trustedCapabilities: deniedSettings.sandbox.trustedCapabilities
    }
  );

  assert.equal(deniedResult.preRequestScriptResult.passed, false);
  assert.match(deniedResult.preRequestScriptResult.tests[0].error, /File attachment binding is required/);
  assert.deepEqual(observed.map((item) => item.path), ['/main-after-denied']);
});

test('vault settings use the encrypted on-disk vault store during request script execution', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-settings-real-vault-'));
  t.after(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });
  const vaultPath = path.join(directory, 'vault.json');
  const vault = new EncryptedVaultStore(vaultPath, testCryptoProvider());
  await vault.set('apiToken', 'persisted-secret', { requestId: 'seed-request' });
  const settings = normalizeSettings({
    sandbox: {
      trustedCapabilities: {
        sendRequest: true,
        cookies: true,
        vault: true,
        vaultGrants: { workspace: true }
      }
    }
  });
  const request = requestWithScript(`
    pm.test('encrypted vault store is available to scripts', async function () {
      pm.expect(await pm.vault.get('apiToken')).to.equal('persisted-secret');
      await pm.vault.set('runtimeToken', 'runtime-secret');
      pm.expect(await pm.vault.get('runtimeToken')).to.equal('runtime-secret');
      await pm.vault.unset('apiToken');
      pm.environment.set('vaultResult', await pm.vault.get('runtimeToken'));
    });
  `);
  request.scripts.tests = `
    pm.test('vault script side effects commit after response', function () {
      pm.expect(pm.environment.get('vaultResult')).to.equal('runtime-secret');
    });
  `;

  const result = await runRequestWithScripts(request, emptyEnvironment(), runtimeOptions(settings, { vault }));
  assert.equal(result.preRequestScriptResult.passed, true);
  assert.equal(result.response.testScriptResult.passed, true);
  assert.equal(await vault.get('apiToken'), undefined);
  assert.equal(await vault.get('runtimeToken'), 'runtime-secret');
  const audit = await vault.listAudit();
  assert.ok(audit.some((entry) => entry.operation === 'get' && entry.key === 'apiToken'));
  assert.ok(audit.some((entry) => entry.operation === 'set' && entry.key === 'runtimeToken'));
  assert.ok(audit.some((entry) => entry.operation === 'unset' && entry.key === 'apiToken'));
  const rawVault = await fs.readFile(vaultPath, 'utf8');
  assert.equal(rawVault.includes('persisted-secret'), false);
  assert.equal(rawVault.includes('runtime-secret'), false);

  const denied = await runRequestWithScripts(
    requestWithScript(`
      pm.test('vault disabled blocks encrypted store access', async function () {
        await pm.vault.get('runtimeToken');
      });
    `),
    emptyEnvironment(),
    runtimeOptions(normalizeSettings({
      sandbox: {
        trustedCapabilities: { sendRequest: true, cookies: true, vault: false }
      }
    }), { vault })
  );
  assert.equal(denied.preRequestScriptResult.passed, false);
  assert.match(denied.preRequestScriptResult.tests[0].error, /pm\.vault is disabled/);
  assert.equal(await vault.get('runtimeToken'), 'runtime-secret');
});

test('diagnostic settings control local JSONL logging and request-response field accuracy', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-settings-diagnostics-'));
  t.after(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });
  let settings = normalizeSettings({
    diagnostics: {
      logging: { enabled: false, level: 'debug' },
      requestResponseLogging: {
        urls: true,
        headers: true,
        cookies: true,
        bodies: true,
        protocolMessages: true,
        scriptConsole: true,
        payloadIdentifiers: true
      }
    }
  });
  const logger = new LocalDiagnosticsLogger({
    logDirectory: directory,
    maxFileBytes: 4096,
    maxFiles: 2,
    maxRecordBytes: 8192,
    settingsProvider: () => settings.diagnostics
  });
  const event = {
    type: 'settings.runtime.diagnostic',
    level: 'debug',
    fields: {
      requestUrl: 'https://api.example.test/v1/customers?query=visible&access_token=secret-token',
      method: 'POST',
      statusCode: 201,
      headers: { 'X-Safe': 'visible-header', Authorization: 'Bearer secret-token' },
      body: 'diagnostic-body-visible',
      responseBytes: 31,
      logs: ['diagnostic-console-visible'],
      payloadIdentifier: 'safe-payload-id'
    }
  };

  assert.equal(await logger.log(event), null);
  assert.deepEqual(await fs.readdir(directory).catch(() => []), []);

  settings = normalizeSettings({
    diagnostics: {
      logging: { enabled: true, level: 'debug' },
      requestResponseLogging: {
        urls: false,
        headers: false,
        cookies: false,
        bodies: false,
        protocolMessages: false,
        scriptConsole: false,
        payloadIdentifiers: false
      }
    }
  });
  const omitted = await logger.log(event);
  assert.equal(omitted.fields.requestUrl, '[omitted:urls]');
  assert.equal(omitted.fields.method, '[omitted:headers]');
  assert.equal(omitted.fields.statusCode, '[omitted:headers]');
  assert.equal(omitted.fields.headers, '[omitted:headers]');
  assert.equal(omitted.fields.body, '[omitted:bodies]');
  assert.equal(omitted.fields.logs, '[omitted:scriptConsole]');
  assert.equal(omitted.fields.payloadIdentifier, '[omitted:payloadIdentifiers]');

  settings = normalizeSettings({
    diagnostics: {
      logging: { enabled: true, level: 'debug' },
      requestResponseLogging: {
        urls: true,
        headers: true,
        cookies: true,
        bodies: true,
        protocolMessages: true,
        scriptConsole: true,
        payloadIdentifiers: true
      }
    }
  });
  const included = await logger.log(event);
  assert.match(included.fields.requestUrl, /https:\/\/api\.example\.test\/v1\/customers/);
  assert.match(included.fields.requestUrl, /query=visible/);
  assert.doesNotMatch(included.fields.requestUrl, /secret-token/);
  assert.equal(included.fields.method, 'POST');
  assert.equal(included.fields.statusCode, 201);
  assert.equal(included.fields.headers['X-Safe'], 'visible-header');
  assert.equal(included.fields.headers.Authorization, '[redacted]');
  assert.equal(included.fields.body, 'diagnostic-body-visible');
  assert.equal(included.fields.responseBytes, 31);
  assert.deepEqual(included.fields.logs, ['diagnostic-console-visible']);
  assert.equal(included.fields.payloadIdentifier, 'safe-payload-id');

  const recent = await logger.readRecentEntries();
  assert.equal(recent.length, 2);
  assert.deepEqual(recent.map((entry) => entry.type), ['settings.runtime.diagnostic', 'settings.runtime.diagnostic']);
});

async function createServer(handler) {
  const server = http.createServer((request, response) => {
    handler(request, response).catch((error) => {
      response.statusCode = 500;
      response.end(error.stack || String(error));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

function testCryptoProvider() {
  return {
    isAvailable: () => true,
    encryptString(value) {
      return Buffer.from(`sealed:${Buffer.from(String(value), 'utf8').toString('base64')}`, 'utf8');
    },
    decryptString(value) {
      const text = Buffer.from(value).toString('utf8');
      if (!text.startsWith('sealed:')) {
        throw new Error('Bad test ciphertext.');
      }
      return Buffer.from(text.slice('sealed:'.length), 'base64').toString('utf8');
    }
  };
}
