const assert = require('node:assert/strict');
const test = require('node:test');
const {
  applyPostmanCookieMetadata,
  cookieFieldIssues,
  domainFromRequestUrl,
  isExpiredCookie,
  newWorkspaceCookie,
  parseCookieHeaderForJar,
  postmanCookieMetadataByName,
  rendererCookieMatchesHost
} = require('../../src/renderer/models/cookieModel');

test('renderer cookie model creates workspace cookies with stable defaults', () => {
  const originalRandomUuid = globalThis.crypto?.randomUUID;
  globalThis.crypto ||= {};
  globalThis.crypto.randomUUID = () => 'cookie-id';
  try {
    assert.deepEqual(newWorkspaceCookie({ domain: '.Example.Test.' }), {
      id: 'cookie-id',
      enabled: true,
      name: '',
      value: '',
      domain: 'example.test',
      path: '/',
      expiresAt: '',
      secure: false,
      httpOnly: false,
      sameSite: 'Lax',
      hostOnly: true,
      priority: '',
      partitioned: false,
      source: '',
      extensions: []
    });
  } finally {
    globalThis.crypto.randomUUID = originalRandomUuid;
  }
});

test('renderer cookie model imports postman metadata and cookie header values', () => {
  const originalRandomUuid = globalThis.crypto?.randomUUID;
  globalThis.crypto ||= {};
  globalThis.crypto.randomUUID = () => 'parsed-cookie-id';
  try {
    const metadata = postmanCookieMetadataByName([
      { enabled: true, key: 'postman.cookies', value: JSON.stringify([
        {
          name: 'sid',
          value: 'override',
          domain: '.Example.Test.',
          path: '/api',
          expiresAt: '2030-01-01',
          secure: true,
          httpOnly: true,
          sameSite: 'strict',
          hostOnly: false,
          priority: 'high',
          partitioned: true,
          source: 'postman',
          extensions: ['SameParty']
        }
      ]) }
    ]);
    const [parsed] = parseCookieHeaderForJar('sid=from-header; theme=dark', 'api.example.test');

    assert.equal(parsed.id, 'parsed-cookie-id');
    assert.equal(parsed.domain, 'api.example.test');

    const merged = applyPostmanCookieMetadata(parsed, metadata.get('sid'));
    assert.equal(merged.value, 'override');
    assert.equal(merged.domain, 'example.test');
    assert.equal(merged.path, '/api');
    assert.equal(merged.expiresAt, '2030-01-01T00:00:00.000Z');
    assert.equal(merged.sameSite, 'Strict');
    assert.equal(merged.priority, 'High');
    assert.equal(merged.partitioned, true);
    assert.deepEqual(merged.extensions, ['SameParty']);
  } finally {
    globalThis.crypto.randomUUID = originalRandomUuid;
  }
});

test('renderer cookie model validates domains, paths, expiry, and host matching', () => {
  assert.equal(domainFromRequestUrl('https://API.example.test/path'), 'api.example.test');
  assert.equal(rendererCookieMatchesHost({ domain: 'example.test', hostOnly: false }, 'api.example.test'), true);
  assert.equal(rendererCookieMatchesHost({ domain: 'example.test', hostOnly: true }, 'api.example.test'), false);

  assert.deepEqual(cookieFieldIssues({
    domain: 'http://bad host/path',
    path: 'api',
    expiresAt: 'not-a-date',
    hostOnly: false
  }, 'api.example.test'), {
    domain: 'Cookie domain must be a hostname without spaces, protocol, or path.',
    path: 'Cookie path must start with /.',
    expires: 'Cookie expiry must be a valid date or ISO timestamp.'
  });

  assert.deepEqual(cookieFieldIssues({
    domain: '127.0.0.1',
    path: '/',
    expiresAt: '',
    hostOnly: false
  }, '127.0.0.1'), {
    domain: 'IP-address cookies must be host-only.'
  });

  assert.deepEqual(cookieFieldIssues({
    domain: 'other.example.test',
    path: '/',
    expiresAt: '',
    hostOnly: false
  }, 'api.example.test'), {
    domain: 'Cookie domain does not match the active request host.'
  });
});

test('renderer cookie model detects expiry conservatively', () => {
  assert.equal(isExpiredCookie({ expiresAt: '' }), false);
  assert.equal(isExpiredCookie({ expiresAt: '2035-01-01T00:00:00.000Z' }), false);
  assert.equal(isExpiredCookie({ expiresAt: '2000-01-01T00:00:00.000Z' }), true);
});
