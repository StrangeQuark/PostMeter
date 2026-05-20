const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { CURRENT_SCHEMA_VERSION } = require('../../src/core/workspace/models');
const { cliShouldRequireNodePermission, cliTlsSettings, loadCollectionInput, parseArgs } = require('../../scripts/postmeter-cli');

test('requires Node permission flags for CLI script workers on supported Node baselines', () => {
  const major = Number(String(process.versions.node || '').split('.')[0]);
  assert.equal(cliShouldRequireNodePermission(), Number.isFinite(major) && major >= 22);
});

test('parses CLI TLS verification and certificate flags', () => {
  const args = parseArgs([
    'run',
    '--file', 'workspace.json',
    '-k',
    '--ssl-extra-ca-certs', '/tmp/ca.pem',
    '--client-cert-host', '*.example.test',
    '--client-cert-port', '8443',
    '--ssl-client-cert', '/tmp/client.crt',
    '--ssl-client-key', '/tmp/client.key',
    '--ssl-client-passphrase', 'secret'
  ]);
  const settings = cliTlsSettings(args, {});
  assert.equal(settings.request.sslCertificateVerification, false);
  assert.equal(settings.request.caCertificatePath, '/tmp/ca.pem');
  assert.equal(settings.request.clientCertificates[0].host, '*.example.test');
  assert.equal(settings.request.clientCertificates[0].port, '8443');
  assert.equal(settings.request.clientCertificates[0].passphrase, 'secret');
});

test('loads managed workspace TLS local settings for CLI runs', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-cli-settings-'));
  const workspacePath = path.join(tempDir, 'workspace.json');
  await fs.writeFile(workspacePath, JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    collections: [{
      id: 'collection-1',
      name: 'CLI',
      requests: [{
        id: 'request-1',
        name: 'Request',
        method: 'GET',
        url: 'https://example.test',
        queryParams: [],
        headers: [],
        bodyType: 'NONE',
        body: '',
        auth: { type: 'none' },
        scripts: { preRequest: '', tests: '' }
      }],
      folders: [],
      variables: [],
      certificates: []
    }],
    environments: [],
    globals: [],
    cookies: [],
    history: [],
    runners: [],
    performanceTests: [],
    localsettings: {
      request: {
        sslCertificateVerification: false,
        caCertificatePath: '/tmp/ca.pem',
        clientCertificates: [{
          id: 'managed-cert',
          host: 'api.example.test',
          certPath: '/tmp/client.crt',
          keyPath: '/tmp/client.key'
        }]
      }
    }
  }, null, 2));

  const { settings } = await loadCollectionInput(workspacePath, { collectionSelector: 'CLI' });
  assert.equal(settings.request.sslCertificateVerification, false);
  assert.equal(settings.request.caCertificatePath, '/tmp/ca.pem');
  assert.equal(settings.request.clientCertificates[0].id, 'managed-cert');
});

test('runs collections headlessly and writes reports', async () => {
  const server = await createServer();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-cli-'));
  try {
    const passingWorkspacePath = path.join(tempDir, 'workspace.json');
    const passingReportPath = path.join(tempDir, 'passing-report.json');
    await fs.writeFile(passingWorkspacePath, JSON.stringify(workspace(server.baseUrl, 200), null, 2));

    const passing = await runCli([
      'run',
      '--file',
      passingWorkspacePath,
      '--collection',
      'CLI',
      '--var',
      'cliToken=from-cli',
      '--collection-var',
      `baseUrl=${server.baseUrl}`,
      '--report',
      passingReportPath
    ], tempDir);
    assert.equal(passing.code, 0, passing.stderr);
    assert.match(passing.stdout, /PostMeter collection run passed/);
    const passingReport = JSON.parse(await fs.readFile(passingReportPath, 'utf8'));
    assert.equal(passingReport.passed, true);
    assert.equal(passingReport.totalRequests, 1);
    assert.equal(passingReport.results[0].testScriptResult.tests[0].name, 'script sees CLI variables');
    assert.equal(passingReport.environment.variables.find((item) => item.key === 'cliToken').value, 'from-cli');

    const htmlReportPath = path.join(tempDir, 'passing-report.html');
    const htmlRun = await runCli([
      'run',
      '--file',
      passingWorkspacePath,
      '--collection',
      'CLI',
      '--var',
      'cliToken=from-cli',
      '--collection-var',
      `baseUrl=${server.baseUrl}`,
      '--report',
      htmlReportPath,
      '--format',
      'html'
    ], tempDir);
    assert.equal(htmlRun.code, 0, htmlRun.stderr);
    const htmlReport = await fs.readFile(htmlReportPath, 'utf8');
    assert.match(htmlReport, /PostMeter Runner Results/);
    assert.match(htmlReport, /Charts and Trends/);
    assert.match(htmlReport, /Response Details/);

    const failingWorkspacePath = path.join(tempDir, 'workspace-fail.json');
    const failingReportPath = path.join(tempDir, 'failing-report.csv');
    await fs.writeFile(failingWorkspacePath, JSON.stringify(workspace(server.baseUrl, 204), null, 2));

    const failing = await runCli(['run', '--file', failingWorkspacePath, '--var', 'cliToken=from-cli', '--report', failingReportPath, '--format', 'csv'], tempDir);
    assert.equal(failing.code, 1);
    assert.match(failing.stdout, /PostMeter collection run failed/);
    assert.match(await fs.readFile(failingReportPath, 'utf8'), /status/i);
  } finally {
    await server.close();
  }
});

function workspace(baseUrl, expectedStatus) {
  return {
    schemaVersion: 6,
    collections: [{
      id: 'c1',
      name: 'CLI',
      description: '',
      variables: [{ enabled: true, key: 'baseUrl', value: baseUrl }],
      requests: [{
        id: 'r1',
        name: 'OK',
        method: 'GET',
        url: '{{baseUrl}}/ok',
        queryParams: [],
        headers: [],
        bodyType: 'NONE',
        body: '',
        auth: { type: 'none' },
        scripts: {
          preRequest: "pm.environment.set('fromPreRequest', pm.variables.get('cliToken') || 'missing');",
          tests: `pm.test('script sees CLI variables', function () { pm.expect(pm.environment.get('fromPreRequest')).to.equal('from-cli'); pm.response.to.have.status(${expectedStatus}); });`
        }
      }],
      folders: []
    }],
    environments: [],
    history: []
  };
}

function runCli(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', '..', 'scripts', 'postmeter-cli.js'), ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

async function createServer() {
  const server = http.createServer((_request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end('{"ok":true}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}
