const assert = require('node:assert/strict');
const test = require('node:test');
const {
  cookieMatchesHost,
  domainFromRequestUrl,
  isExpiredCookie,
  newWorkspaceCookie,
  normalizeCookies
} = require('../../src/core/cookieModel');

test('shared cookie model creates new workspace cookies with renderer-compatible defaults', () => {
  assert.deepEqual(newWorkspaceCookie({ domain: '.Example.Test.' }, { createId: () => 'cookie-id' }), {
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
});

test('shared cookie model normalizes persisted cookies without changing runtime defaults', () => {
  assert.deepEqual(normalizeCookies([
    {
      name: 'sid',
      value: 'abc',
      domain: '.Example.Test.',
      path: 'api',
      expiresAt: '2030-01-01',
      sameSite: 'strict',
      priority: 'high',
      source: ' imported ',
      extensions: ['SameParty', '', null]
    },
    {
      name: '',
      domain: 'example.test'
    }
  ], { createId: () => 'normalized-id' }), [{
    id: 'normalized-id',
    enabled: true,
    name: 'sid',
    value: 'abc',
    domain: 'example.test',
    path: '/api',
    expiresAt: '2030-01-01T00:00:00.000Z',
    secure: false,
    httpOnly: false,
    sameSite: 'Strict',
    hostOnly: true,
    priority: 'High',
    partitioned: false,
    source: 'imported',
    extensions: ['SameParty']
  }]);
});

test('shared cookie model handles host matching, request URL parsing, and expiry checks', () => {
  assert.equal(domainFromRequestUrl('https://API.example.test/path'), 'api.example.test');
  assert.equal(cookieMatchesHost({ domain: 'example.test', hostOnly: false }, 'api.example.test'), true);
  assert.equal(cookieMatchesHost({ domain: 'example.test', hostOnly: true }, 'api.example.test'), false);
  assert.equal(isExpiredCookie({ expiresAt: '2035-01-01T00:00:00.000Z' }, Date.parse('2030-01-01T00:00:00.000Z')), false);
  assert.equal(isExpiredCookie({ expiresAt: '2000-01-01T00:00:00.000Z' }, Date.parse('2030-01-01T00:00:00.000Z')), true);
});
