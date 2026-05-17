const assert = require('node:assert/strict');
const test = require('node:test');
const {
  RAW_BODY_PATH,
  buildAuthRefreshAutoDetectCandidates
} = require('../../src/renderer/authRefreshAutoDetectModel');

test('auth refresh auto-detect exposes body header and cookie response options', () => {
  const candidates = buildAuthRefreshAutoDetectCandidates({
    body: JSON.stringify({
      access_token: 'access-token-value',
      timestamp: '2026-05-16T12:00:00.000Z',
      nested: {
        refresh_token: 'refresh-token-value'
      },
      tokens: [{ value: 'array-token' }]
    }),
    headers: {
      'x-access-token': 'header-token',
      'x-frame-options': 'DENY',
      'content-type': 'application/json',
      'set-cookie': ['session=from-header; Path=/']
    },
    updatedCookies: [
      { name: 'session', value: 'from-cookie-jar' },
      { name: 'refresh_session', value: 'refresh-cookie' },
      { name: 'theme', value: 'dark' }
    ]
  });

  assert.ok(!candidates.some((candidate) => candidate.source === 'rawBody' && candidate.path === RAW_BODY_PATH));
  assert.ok(candidates.some((candidate) => candidate.source === 'body' && candidate.path === 'access_token'));
  assert.ok(candidates.some((candidate) => candidate.source === 'body' && candidate.path === 'nested.refresh_token'));
  assert.ok(candidates.some((candidate) => candidate.source === 'body' && candidate.path === 'tokens[0].value'));
  assert.ok(!candidates.some((candidate) => candidate.source === 'body' && candidate.path === 'timestamp'));
  assert.ok(candidates.some((candidate) => candidate.source === 'header' && candidate.path === 'x-access-token'));
  assert.ok(!candidates.some((candidate) => candidate.source === 'header' && candidate.path === 'x-frame-options'));
  assert.ok(!candidates.some((candidate) => candidate.source === 'header' && candidate.path === 'content-type'));
  assert.ok(candidates.some((candidate) => candidate.source === 'cookie' && candidate.path === 'session'));
  assert.ok(candidates.some((candidate) => candidate.source === 'cookie' && candidate.path === 'refresh_session'));
  assert.ok(!candidates.some((candidate) => candidate.source === 'cookie' && candidate.path === 'theme'));
});

test('auth refresh auto-detect supports raw token response bodies', () => {
  const candidates = buildAuthRefreshAutoDetectCandidates({
    body: 'eyJhbGciOiJIUzI1NiJ9.token.signature',
    headers: {}
  });

  assert.deepEqual(
    candidates.map((candidate) => `${candidate.source}:${candidate.path}`),
    [`rawBody:${RAW_BODY_PATH}`]
  );
});
