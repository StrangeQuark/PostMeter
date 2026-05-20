const assert = require('node:assert/strict');
const test = require('node:test');
const {
  clientCertificateMatchesUrl,
  findMatchingClientCertificate,
  normalizeRequestTlsSettings,
  normalizeTlsSettings,
  resolveHttpTlsPolicy,
  resolveTlsSettingsSecrets
} = require('../../src/core/http/tlsSettings');

test('resolves managed client-certificate passphrases from the workspace vault', async () => {
  const requestedKeys = [];
  const resolved = await resolveTlsSettingsSecrets({
    request: {
      sslCertificateVerification: false,
      caCertificatePath: '/tmp/postmeter-ca.pem',
      clientCertificates: [
        {
          id: 'vault-cert',
          host: 'api.example.test',
          certPath: '/tmp/client.crt',
          keyPath: '/tmp/client.key',
          passphraseSecretKey: 'client-certificate:vault-cert:passphrase'
        },
        {
          id: 'plain-cert',
          host: 'plain.example.test',
          passphrase: 'already-local',
          passphraseSecretKey: 'client-certificate:plain-cert:passphrase'
        }
      ]
    }
  }, {
    async get(key) {
      requestedKeys.push(key);
      return key === 'client-certificate:vault-cert:passphrase' ? 'from-vault' : null;
    }
  });

  assert.equal(resolved.sslCertificateVerification, false);
  assert.equal(resolved.caCertificatePath, '/tmp/postmeter-ca.pem');
  assert.equal(resolved.clientCertificates[0].passphrase, 'from-vault');
  assert.equal(resolved.clientCertificates[1].passphrase, 'already-local');
  assert.deepEqual(requestedKeys, ['client-certificate:vault-cert:passphrase']);
});

test('normalizes TLS verification aliases and request-local overrides', () => {
  assert.equal(normalizeTlsSettings({}).sslCertificateVerification, true);
  assert.equal(normalizeRequestTlsSettings({ strictSSL: false }).sslCertificateVerification, 'disabled');
  assert.equal(normalizeRequestTlsSettings({ sslVerification: true, caCertificatePath: '/ca.pem' }).sslCertificateVerification, 'enabled');
  assert.equal(normalizeTlsSettings({ request: { sslCertificateVerification: 'off' } }).sslCertificateVerification, false);
  assert.equal(normalizeTlsSettings({ tls: { strictSSL: 'yes' } }).sslCertificateVerification, true);
});

test('normalizes already-resolved flat TLS settings without dropping trust state', () => {
  const normalized = normalizeTlsSettings({
    sslCertificateVerification: false,
    caCertificatePath: '/tmp/flat-ca.pem',
    clientCertificates: [{
      id: 'flat-cert',
      host: '*',
      certPath: '/tmp/client.crt',
      keyPath: '/tmp/client.key'
    }]
  });

  assert.equal(normalized.sslCertificateVerification, false);
  assert.equal(normalized.caCertificatePath, '/tmp/flat-ca.pem');
  assert.equal(normalized.clientCertificates[0].id, 'flat-cert');
});

test('matches managed client certificates by host, wildcard, match URL, and port with last match winning', () => {
  const url = new URL('https://api.example.test/widgets');
  const certificates = [
    {
      id: 'disabled',
      enabled: false,
      host: 'api.example.test',
      port: '443'
    },
    {
      id: 'middle-wildcard',
      enabled: true,
      host: 'api.*.test',
      port: '443'
    },
    {
      id: 'wildcard',
      enabled: true,
      host: '*.example.test',
      port: '443'
    },
    {
      id: 'wrong-port',
      enabled: true,
      host: 'api.example.test',
      port: '8443'
    },
    {
      id: 'match-url',
      enabled: true,
      matches: ['https://api.example.test/*'],
      port: '443'
    },
    {
      id: 'path-specific',
      enabled: true,
      matches: ['https://api.example.test/private/*'],
      port: '443'
    }
  ];

  assert.equal(clientCertificateMatchesUrl(certificates[0], url), false);
  assert.equal(clientCertificateMatchesUrl(certificates[1], url), true);
  assert.equal(clientCertificateMatchesUrl(certificates[2], url), true);
  assert.equal(clientCertificateMatchesUrl(certificates[3], url), false);
  assert.equal(clientCertificateMatchesUrl(certificates[5], url), false);
  assert.equal(clientCertificateMatchesUrl(certificates[5], new URL('https://api.example.test/private/health')), true);
  assert.equal(findMatchingClientCertificate(certificates, url).id, 'match-url');
  assert.equal(findMatchingClientCertificate(certificates, new URL('grpcs://api.example.test:443/Greeter/SayHello')).id, 'wildcard');
});

test('builds HTTP TLS policy from global settings and request-local overrides', async () => {
  const inheritedDefault = await resolveHttpTlsPolicy({
    auth: { type: 'none' }
  }, null, new URL('https://api.example.test'), {});

  assert.equal(inheritedDefault.tlsOptions, null);
  assert.equal(inheritedDefault.tlsDiagnostics.verificationDisabled, false);

  const inheritedDisabled = await resolveHttpTlsPolicy({
    auth: { type: 'none' }
  }, null, new URL('https://api.example.test'), {
    tlsSettings: {
      request: {
        sslCertificateVerification: false
      }
    }
  });

  assert.equal(inheritedDisabled.tlsOptions.rejectUnauthorized, false);
  assert.equal(inheritedDisabled.tlsDiagnostics.verificationDisabled, true);

  const requestEnabled = await resolveHttpTlsPolicy({
    auth: { type: 'none' },
    settings: { sslCertificateVerification: 'enabled' }
  }, null, new URL('https://api.example.test'), {
    tlsSettings: {
      request: {
        sslCertificateVerification: false
      }
    }
  });

  assert.equal(requestEnabled.tlsOptions, null);
  assert.equal(requestEnabled.tlsDiagnostics.verificationDisabled, false);

  const requestDisabled = await resolveHttpTlsPolicy({
    auth: { type: 'none' },
    settings: { sslCertificateVerification: 'disabled' }
  }, null, new URL('https://api.example.test'), {
    tlsSettings: {
      request: {
        sslCertificateVerification: true
      }
    }
  });

  assert.equal(requestDisabled.tlsOptions.rejectUnauthorized, false);
  assert.equal(requestDisabled.tlsDiagnostics.verificationDisabled, true);

  const requestLocalCaIgnored = await resolveHttpTlsPolicy({
    auth: { type: 'none' },
    settings: {
      caCertificatePath: '/does/not/exist/request-ca.pem',
      sslCertificateVerification: 'enabled'
    }
  }, null, new URL('https://api.example.test'), {
    tlsSettings: {
      request: {
        sslCertificateVerification: true
      }
    }
  });

  assert.equal(requestLocalCaIgnored.tlsOptions, null);
  assert.equal(requestLocalCaIgnored.tlsDiagnostics.caCertificateConfigured, false);
});
