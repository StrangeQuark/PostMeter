const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  DEFAULT_REQUEST_MAX_REDIRECTS,
  MAX_REQUEST_MAX_REDIRECTS,
  hasRequestTransportTlsOptions,
  mergePostmanProtocolProfiles,
  normalizeRequestSettings,
  postmanRequestSettingsFromProtocolProfile,
  requestSettingsRequireNodeTransport,
  requestTransportTlsOptions,
  syncPostmanRequestSettingsProtocolProfile
} = require('../../src/core/http/requestSettings');

test('request settings normalize defaults, aliases, booleans, and redirect bounds', () => {
  assert.deepEqual(normalizeRequestSettings(), {
    sslCertificateVerification: 'inherit',
    httpVersion: 'auto',
    followRedirects: true,
    followOriginalHttpMethod: false,
    followAuthorizationHeader: false,
    removeRefererHeaderOnRedirect: false,
    strictHttpParser: true,
    encodeUrlAutomatically: true,
    maxRedirects: DEFAULT_REQUEST_MAX_REDIRECTS,
    useServerCipherSuiteDuringHandshake: false,
    disabledTlsProtocols: [],
    cipherSuiteSelection: ''
  });
  assert.deepEqual(normalizeRequestSettings({
    strictSSL: false,
    protocolVersion: 'h2',
    followRedirects: 'off',
    followOriginalHttpMethod: 'yes',
    followAuthorizationHeader: '1',
    removeRefererHeaderOnRedirect: true,
    strictHttpParser: 'disabled',
    disableUrlEncoding: 'true',
    maximumNumberOfRedirects: MAX_REQUEST_MAX_REDIRECTS + 5
  }), {
    sslCertificateVerification: 'disabled',
    httpVersion: 'http2',
    followRedirects: false,
    followOriginalHttpMethod: true,
    followAuthorizationHeader: true,
    removeRefererHeaderOnRedirect: true,
    strictHttpParser: false,
    encodeUrlAutomatically: false,
    maxRedirects: MAX_REQUEST_MAX_REDIRECTS,
    useServerCipherSuiteDuringHandshake: false,
    disabledTlsProtocols: [],
    cipherSuiteSelection: ''
  });
  assert.equal(normalizeRequestSettings({ maxRedirects: -5 }).maxRedirects, 0);
  assert.equal(normalizeRequestSettings({ httpVersion: 'HTTP/1.1' }).httpVersion, 'http1');
  assert.equal(normalizeRequestSettings({ sslVerification: 'on' }).sslCertificateVerification, 'enabled');
});

test('request settings build bounded TLS transport options', () => {
  const normalized = normalizeRequestSettings({
    useServerCipherSuiteDuringHandshake: true,
    disabledTLSProtocols: ['TLSv1', 'tls1.1', 'TLSv1', 'unknown'],
    cipherSuites: [' TLS_AES_256_GCM_SHA384 ', '', 'TLS_CHACHA20_POLY1305_SHA256']
  });
  assert.deepEqual(normalized.disabledTlsProtocols, ['TLSv1', 'TLSv1.1']);
  assert.equal(normalized.cipherSuiteSelection, 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256');

  const tlsOptions = requestTransportTlsOptions(normalized);
  assert.equal(tlsOptions.honorCipherOrder, true);
  assert.equal(tlsOptions.ciphers, 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256');
  assert.equal(
    tlsOptions.secureOptions,
    crypto.constants.SSL_OP_NO_TLSv1 | crypto.constants.SSL_OP_NO_TLSv1_1
  );
  assert.equal(hasRequestTransportTlsOptions(normalized), true);
  assert.equal(hasRequestTransportTlsOptions({}), false);
});

test('request settings sync to and from Postman protocol profiles', () => {
  const settings = postmanRequestSettingsFromProtocolProfile({
    strictSSL: true,
    httpVersion: 'http/1.1',
    followRedirects: false,
    followOriginalHttpMethod: true,
    followAuthorizationHeader: true,
    removeRefererHeaderOnRedirect: true,
    strictHttpParser: true,
    disableUrlEncoding: true,
    maxRedirects: 3,
    useServerCipherSuiteDuringHandshake: true,
    disabledProtocols: 'tls1 tls1.2',
    ciphers: 'A\nB,C'
  });
  assert.equal(settings.sslCertificateVerification, 'enabled');
  assert.equal(settings.httpVersion, 'http1');
  assert.equal(settings.followRedirects, false);
  assert.equal(settings.encodeUrlAutomatically, false);
  assert.deepEqual(settings.disabledTlsProtocols, ['TLSv1', 'TLSv1.2']);
  assert.equal(settings.cipherSuiteSelection, 'A:B:C');

  const profile = syncPostmanRequestSettingsProtocolProfile({ stale: 'remove-me' }, settings);
  assert.deepEqual(profile, {
    stale: 'remove-me',
    strictSSL: true,
    httpVersion: 'http1',
    followRedirects: false,
    followOriginalHttpMethod: true,
    followAuthorizationHeader: true,
    removeRefererHeaderOnRedirect: true,
    strictHttpParser: true,
    disableUrlEncoding: true,
    maxRedirects: 3,
    useServerCipherSuiteDuringHandshake: true,
    disabledTlsProtocols: ['TLSv1', 'TLSv1.2'],
    cipherSuiteSelection: 'A:B:C'
  });

  assert.deepEqual(syncPostmanRequestSettingsProtocolProfile({
    strictSSL: false,
    httpVersion: 'http2',
    followRedirects: false,
    disableUrlEncoding: true,
    maxRedirects: 2,
    disabledTlsProtocols: ['TLSv1']
  }, {}), {
    strictHttpParser: true
  });
});

test('request settings merge protocol profiles and decide transport requirements', () => {
  assert.deepEqual(mergePostmanProtocolProfiles(null, { a: 1 }, ['ignored'], { b: 2, a: 3 }), { a: 3, b: 2 });
  assert.equal(requestSettingsRequireNodeTransport({}), true);
  assert.equal(requestSettingsRequireNodeTransport({ httpVersion: 'http2' }), true);
  assert.equal(requestSettingsRequireNodeTransport({ followAuthorizationHeader: true }), true);
  assert.equal(requestSettingsRequireNodeTransport({ disabledTlsProtocols: ['tls1.3'] }), true);
});
