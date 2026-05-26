const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { createFileCapabilityStore } = require('../../electron/security/fileCapabilities');
const {
  assertPublicHttpsUrl,
  classifyHostname,
  classifyIpAddress,
  classifyNetworkDestination,
  classifyResolvedAddresses,
  normalizeHostname
} = require('../../src/core/security/networkPolicy');
const {
  assertContentLengthWithinLimit,
  normalizeResponseLimits,
  responseTooLargeError
} = require('../../src/core/security/responseLimits');

test('file capabilities are scoped, expiring, and one-time', () => {
  let now = 1000;
  const store = createFileCapabilityStore({ now: () => now, ttlMillis: 1000 });
  const issued = store.issue({
    path: path.join(process.cwd(), 'workspace.json'),
    operation: 'workspace-import',
    workspaceId: 'workspace-1'
  });

  assert.equal(typeof issued.token, 'string');
  assert.equal(issued.operation, 'workspace-import');

  assert.throws(
    () => store.consume(issued.token, { operation: 'collection-import', workspaceId: 'workspace-1' }),
    /not valid for this operation/
  );
  assert.throws(
    () => store.consume(issued.token, { operation: 'workspace-import', workspaceId: 'workspace-2' }),
    /not valid for this workspace/
  );
  const unscoped = store.issue({
    path: path.join(process.cwd(), 'unscoped.json'),
    operation: 'workspace-import'
  });
  assert.throws(
    () => store.consume(unscoped.token, { operation: 'workspace-import', workspaceId: 'workspace-1' }),
    /not valid for this workspace/
  );

  const consumed = store.consume(issued.token, { operation: 'workspace-import', workspaceId: 'workspace-1' });
  assert.equal(consumed.operation, 'workspace-import');
  assert.throws(
    () => store.consume(issued.token, { operation: 'workspace-import', workspaceId: 'workspace-1' }),
    /invalid or has already been used/
  );

  const expiring = store.issue({
    path: path.join(process.cwd(), 'request.json'),
    operation: 'request-import',
    workspaceId: 'workspace-1',
    oneTime: false
  });
  now = 3001;
  assert.throws(
    () => store.consume(expiring.token, { operation: 'request-import', workspaceId: 'workspace-1' }),
    /expired/
  );
});

test('request network destination classifier re-checks DNS resolution results', async () => {
  assert.equal((await classifyNetworkDestination('http://127.0.0.1/')).category, 'loopback');
  assert.equal((await classifyNetworkDestination('http://169.254.169.254/')).category, 'metadata');
  const privateDns = await classifyNetworkDestination('https://api.example.test/', {
    resolveHost: async () => [{ address: '10.0.0.5' }]
  });
  assert.equal(privateDns.category, 'private');
  const publicDns = await classifyNetworkDestination('https://api.example.test/', {
    resolveHost: async () => [{ address: '93.184.216.34' }]
  });
  assert.equal(publicDns.category, 'public');
});

test('network classifier blocks local private link-local metadata and mapped private addresses', () => {
  assert.equal(classifyHostname('localhost').category, 'loopback');
  assert.equal(classifyHostname('service.local').category, 'link-local');
  assert.equal(classifyHostname('metadata.google.internal').category, 'metadata');
  assert.equal(classifyIpAddress('127.0.0.1').category, 'loopback');
  assert.equal(classifyIpAddress('10.1.2.3').category, 'private');
  assert.equal(classifyIpAddress('100.64.1.1').category, 'private');
  assert.equal(classifyIpAddress('172.20.0.1').category, 'private');
  assert.equal(classifyIpAddress('192.168.1.1').category, 'private');
  assert.equal(classifyIpAddress('169.254.169.254').category, 'metadata');
  assert.equal(classifyIpAddress('169.254.1.1').category, 'link-local');
  assert.equal(classifyIpAddress('192.0.0.8').category, 'reserved');
  assert.equal(classifyIpAddress('192.0.2.10').category, 'reserved');
  assert.equal(classifyIpAddress('198.18.0.1').category, 'reserved');
  assert.equal(classifyIpAddress('198.51.100.7').category, 'reserved');
  assert.equal(classifyIpAddress('203.0.113.9').category, 'reserved');
  assert.equal(classifyIpAddress('::1').category, 'loopback');
  assert.equal(classifyIpAddress('::').category, 'reserved');
  assert.equal(classifyIpAddress('fc00::1').category, 'private');
  assert.equal(classifyIpAddress('fe80::1').category, 'link-local');
  assert.equal(classifyIpAddress('::ffff:127.0.0.1').category, 'loopback');
  assert.equal(classifyResolvedAddresses([{ address: '8.8.8.8' }, { address: '10.0.0.4' }]).category, 'private');
  assert.equal(normalizeHostname('bücher.example'), 'xn--bcher-kva.example');
});

test('public HTTPS URL validation checks DNS results and allowlists', async () => {
  await assert.rejects(
    () => assertPublicHttpsUrl('http://example.com/pkg.js', { resolveHost: async () => [{ address: '93.184.216.34' }] }),
    /HTTPS/
  );
  await assert.rejects(
    () => assertPublicHttpsUrl('https://user:pass@example.com/pkg.js', { resolveHost: async () => [{ address: '93.184.216.34' }] }),
    /credentials/
  );
  await assert.rejects(
    () => assertPublicHttpsUrl('https://packages.example/pkg.js', { allowedHosts: ['cdn.example'], resolveHost: async () => [{ address: '93.184.216.34' }] }),
    /allowlisted/
  );
  await assert.rejects(
    () => assertPublicHttpsUrl('https://packages.example/pkg.js', { resolveHost: async () => [{ address: '127.0.0.1' }] }),
    /blocked loopback/
  );
  const result = await assertPublicHttpsUrl('https://packages.example/pkg.js', {
    allowedHosts: ['packages.example'],
    resolveHost: async () => [{ address: '93.184.216.34' }]
  });
  assert.equal(result.category, 'public');
  assert.equal(result.hostname, 'packages.example');
});

test('response limit helpers reject oversized content lengths with a stable error code', () => {
  const limits = normalizeResponseLimits({ maxCompressedBytes: 7 });
  assert.equal(limits.maxCompressedBytes, 7);
  assert.throws(
    () => assertContentLengthWithinLimit({ 'content-length': '8' }, limits.maxCompressedBytes),
    (error) => error?.code === 'POSTMETER_RESPONSE_TOO_LARGE'
  );
  assert.equal(responseTooLargeError().code, 'POSTMETER_RESPONSE_TOO_LARGE');
});
