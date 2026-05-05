const assert = require('node:assert/strict');
const test = require('node:test');
const {
  cookiesForRequest,
  domainMatchesHost,
  mergeCookieHeader,
  parseSetCookie,
  updateCookiesFromResponse
} = require('../../src/core/cookieJar');

test('matches cookies by domain, path, secure flag, and longest path first', () => {
  const url = new URL('https://api.example.test/v1/users');
  const cookies = cookiesForRequest([
    cookie('root', '1', { domain: 'example.test', path: '/', hostOnly: false }),
    cookie('v1', '2', { domain: 'api.example.test', path: '/v1' }),
    cookie('otherPath', '3', { domain: 'api.example.test', path: '/v2' }),
    cookie('secure', '4', { domain: 'api.example.test', path: '/', secure: true }),
    cookie('expired', '5', { domain: 'api.example.test', path: '/', expiresAt: '2000-01-01T00:00:00.000Z' })
  ], url);

  assert.deepEqual(cookies.map((item) => item.name), ['v1', 'root', 'secure']);
});

test('preserves explicit Cookie header values over jar values', () => {
  const header = mergeCookieHeader('sid=explicit; theme=dark', [
    cookie('sid', 'jar'),
    cookie('SID', 'case-sensitive'),
    cookie('newCookie', 'yes')
  ]);

  assert.equal(header, 'sid=explicit; theme=dark; SID=case-sensitive; newCookie=yes');
});

test('parses Set-Cookie defaults and rejects invalid cross-domain cookies', () => {
  const url = new URL('https://api.example.test/v1/users/list');
  const parsed = parseSetCookie('sid=abc; Domain=.example.test; HttpOnly; SameSite=Lax', url);
  const rejected = parseSetCookie('sid=abc; Domain=attacker.test', url);
  const publicSuffixLike = parseSetCookie('sid=abc; Domain=.test', url);
  const insecureNone = parseSetCookie('sid=abc; Domain=.example.test; HttpOnly; SameSite=None', url);
  const secureNone = parseSetCookie('token=abc; Secure; SameSite=None', url);

  assert.equal(parsed.domain, 'example.test');
  assert.equal(parsed.path, '/v1/users');
  assert.equal(parsed.hostOnly, false);
  assert.equal(parsed.httpOnly, true);
  assert.equal(parsed.sameSite, 'Lax');
  assert.equal(rejected, null);
  assert.equal(publicSuffixLike, null);
  assert.equal(insecureNone, null);
  assert.equal(secureNone.sameSite, 'None');
});

test('updates response cookies and removes expired identities', () => {
  const url = new URL('https://api.example.test/account');
  const updated = updateCookiesFromResponse([
    cookie('sid', 'old', { domain: 'api.example.test', path: '/' }),
    cookie('keep', 'yes', { domain: 'api.example.test', path: '/' })
  ], [
    'sid=new; Path=/; HttpOnly',
    'keep=gone; Path=/; Max-Age=0'
  ], url);

  assert.equal(updated.some((item) => item.name === 'keep'), false);
  assert.equal(updated.find((item) => item.name === 'sid').value, 'new');
});

test('normalizes host/domain matching without trailing dots', () => {
  assert.equal(domainMatchesHost('api.example.test.', '.example.test.'), true);
  assert.equal(domainMatchesHost('example.test', 'api.example.test'), false);
});

test('uses Max-Age over Expires and ignores malformed expiry metadata', () => {
  const url = new URL('https://api.example.test/account/settings');
  const expired = parseSetCookie('sid=gone; Path=/; Max-Age=0; Expires=Wed, 21 Oct 2099 07:28:00 GMT', url);
  const expiresFallback = parseSetCookie('fallback=yes; Max-Age=not-a-number; Expires=Wed, 21 Oct 2099 07:28:00 GMT', url);
  const malformed = parseSetCookie('broken=yes; Expires=not-a-date', url);

  assert.ok(new Date(expired.expiresAt).getTime() <= Date.now() + 1000);
  assert.equal(new Date(expiresFallback.expiresAt).getUTCFullYear(), 2099);
  assert.equal(malformed.expiresAt, '');
});

test('derives default paths for root and nested request paths', () => {
  assert.equal(parseSetCookie('root=yes', new URL('https://api.example.test')).path, '/');
  assert.equal(parseSetCookie('root=yes', new URL('https://api.example.test/docs')).path, '/');
  assert.equal(parseSetCookie('nested=yes', new URL('https://api.example.test/docs/api/list')).path, '/docs/api');
});

test('handles IP address and localhost cookie domain rules conservatively', () => {
  const ipUrl = new URL('http://127.0.0.1/session');
  const hostOnly = parseSetCookie('sid=abc', ipUrl);
  const domainCookie = parseSetCookie('sid=abc; Domain=127.0.0.1', ipUrl);
  const localhost = parseSetCookie('sid=local; Domain=localhost', new URL('http://localhost/session'));

  assert.equal(hostOnly.domain, '127.0.0.1');
  assert.equal(hostOnly.hostOnly, true);
  assert.equal(domainCookie, null);
  assert.equal(localhost.domain, 'localhost');
  assert.equal(localhost.hostOnly, false);
  assert.equal(cookiesForRequest([localhost], new URL('http://localhost/account')).length, 1);
  assert.equal(cookiesForRequest([localhost], new URL('http://sub.localhost/account')).length, 0);
});

test('uses the last duplicate Set-Cookie attributes and trims input safely', () => {
  const parsed = parseSetCookie(
    '  sid = spaced  ;  Domain = .Example.Test. ; Path = api ; Path = /v2 ; SameSite=Lax ; SameSite=Strict  ',
    new URL('https://api.example.test/v1/users')
  );

  assert.equal(parsed.name, 'sid');
  assert.equal(parsed.value, 'spaced');
  assert.equal(parsed.domain, 'example.test');
  assert.equal(parsed.path, '/v2');
  assert.equal(parsed.sameSite, 'Strict');
  assert.equal(parsed.hostOnly, false);
});

test('enforces secure cookie prefixes and preserves newer cookie attributes', () => {
  const url = new URL('https://api.example.test/account');
  const hostCookie = parseSetCookie('__Host-session=abc; Secure; Path=/; Priority=High; Partitioned', url);
  const secureCookie = parseSetCookie('__Secure-token=abc; Secure; Priority=low', url);

  assert.equal(hostCookie.name, '__Host-session');
  assert.equal(hostCookie.hostOnly, true);
  assert.equal(hostCookie.path, '/');
  assert.equal(hostCookie.priority, 'High');
  assert.equal(hostCookie.partitioned, true);
  assert.equal(hostCookie.source, 'response');
  assert.deepEqual(hostCookie.extensions, []);
  assert.equal(secureCookie.priority, 'Low');
  assert.equal(parseSetCookie('__Secure-token=abc', url), null);
  assert.equal(parseSetCookie('__Host-session=abc; Secure; Path=/account', url), null);
  assert.equal(parseSetCookie('__Host-session=abc; Secure; Domain=example.test; Path=/', url), null);
});

test('rejects public suffix domains, invalid syntax, and insecure partitioned cookies', () => {
  const ukUrl = new URL('https://shop.example.co.uk/account');
  const githubUrl = new URL('https://user.github.io/account');
  const validUk = parseSetCookie('sid=ok; Domain=example.co.uk; Path=/', ukUrl);
  const ipv6HostCookie = parseSetCookie('sid=ip; Path=/', new URL('http://[::1]/account'));

  assert.equal(validUk.domain, 'example.co.uk');
  assert.equal(ipv6HostCookie.domain, '[::1]');
  assert.equal(cookiesForRequest([ipv6HostCookie], new URL('http://[::1]/account')).length, 1);
  assert.equal(parseSetCookie('sid=bad; Domain=co.uk; Path=/', ukUrl), null);
  assert.equal(parseSetCookie('sid=bad; Domain=github.io; Path=/', new URL('https://github.io/account')), null);
  assert.equal(parseSetCookie('sid=bad; Domain=github.io; Path=/', githubUrl), null);
  assert.equal(parseSetCookie('sid=bad; Domain=127.0.0.1; Path=/', new URL('http://127.0.0.1/')), null);
  assert.equal(parseSetCookie('bad name=value; Path=/', new URL('https://api.example.test')), null);
  assert.equal(parseSetCookie('sid=value\u0007; Path=/', new URL('https://api.example.test')), null);
  assert.equal(parseSetCookie('chip=value; Partitioned; Path=/', new URL('https://api.example.test')), null);
});

test('normalizes IDNA domains and keeps creation order for equal-path cookies', () => {
  const parsed = parseSetCookie('sid=unicode; Domain=.mañana.example; Path=/', new URL('https://mañana.example/account'));
  const cookies = cookiesForRequest([
    cookie('first', '1', { domain: 'api.example.test', path: '/same' }),
    cookie('second', '2', { domain: 'api.example.test', path: '/same' }),
    cookie('longer', '3', { domain: 'api.example.test', path: '/same/deep' })
  ], new URL('https://api.example.test/same/deep/resource'));

  assert.equal(parsed.domain, 'xn--maana-pta.example');
  assert.deepEqual(cookies.map((item) => item.name), ['longer', 'first', 'second']);
});

test('updates combined Set-Cookie headers and preserves replaced cookie position', () => {
  const url = new URL('https://api.example.test/account');
  const updated = updateCookiesFromResponse([
    cookie('first', '1', { domain: 'api.example.test', path: '/' }),
    cookie('sid', 'old', { id: 'sid-original', domain: 'api.example.test', path: '/' }),
    cookie('last', '3', { domain: 'api.example.test', path: '/' })
  ], 'sid=new; Path=/; HttpOnly, theme=dark; Path=/; Expires=Wed, 21 Oct 2099 07:28:00 GMT', url);

  assert.deepEqual(updated.map((item) => item.name), ['first', 'sid', 'last', 'theme']);
  assert.equal(updated.find((item) => item.name === 'sid').id, 'sid-original');
  assert.equal(updated.find((item) => item.name === 'sid').value, 'new');
  assert.equal(updated.find((item) => item.name === 'theme').value, 'dark');
});

test('treats cookie names as case-sensitive when merging and deleting', () => {
  const url = new URL('https://api.example.test/account');
  const updated = updateCookiesFromResponse([
    cookie('sid', 'lower', { domain: 'api.example.test', path: '/' }),
    cookie('SID', 'upper', { domain: 'api.example.test', path: '/' })
  ], [
    'SID=gone; Path=/; Max-Age=0',
    'sid=new; Path=/'
  ], url);

  assert.deepEqual(updated.map((item) => `${item.name}=${item.value}`), ['sid=new']);
});

test('clamps huge Max-Age values to the maximum cookie date', () => {
  const parsed = parseSetCookie('sid=long; Max-Age=999999999999999999999999999999; Path=/', new URL('https://api.example.test/account'));
  const expiresAt = new Date(parsed.expiresAt);

  assert.equal(expiresAt.getUTCFullYear(), 9999);
  assert.equal(expiresAt.getUTCMonth(), 11);
  assert.equal(expiresAt.getUTCDate(), 31);
});

function cookie(name, value, overrides = {}) {
  return {
    id: `${name}-id`,
    enabled: true,
    name,
    value,
    domain: 'api.example.test',
    path: '/',
    expiresAt: '',
    secure: false,
    httpOnly: false,
    sameSite: 'Lax',
    hostOnly: true,
    ...overrides
  };
}
