const assert = require('node:assert/strict');
const test = require('node:test');
const { checkForUpdates, compareVersions, normalizeVersion } = require('../../src/core/diagnostics-release/updateChecker');

test('compares and normalizes release versions', () => {
  assert.equal(normalizeVersion('v1.2.3-beta+build'), '1.2.3');
  assert.equal(compareVersions('1.2.4', '1.2.3'), 1);
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.equal(compareVersions('1.2.3', '1.3.0'), -1);
});

test('checks GitHub release metadata for available updates', async () => {
  const result = await checkForUpdates({
    currentVersion: '0.2.0',
    releaseUrl: 'https://api.github.test/releases/latest',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.github.test/releases/latest');
      assert.equal(options.headers.Accept, 'application/vnd.github+json');
      return {
        ok: true,
        json: async () => ({
          tag_name: 'v0.3.0',
          name: 'PostMeter 0.3.0',
          html_url: 'https://github.com/StrangeQuark/PostMeter/releases/tag/v0.3.0',
          published_at: '2026-04-21T00:00:00.000Z',
          prerelease: false
        })
      };
    }
  });

  assert.equal(result.updateAvailable, true);
  assert.equal(result.currentVersion, '0.2.0');
  assert.equal(result.latestVersion, '0.3.0');
  assert.equal(result.releaseUrl, 'https://github.com/StrangeQuark/PostMeter/releases/tag/v0.3.0');
});

test('reports no update when latest release is not newer', async () => {
  const result = await checkForUpdates({
    currentVersion: '0.3.0',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ tag_name: 'v0.3.0', html_url: 'https://github.com/StrangeQuark/PostMeter/releases/tag/v0.3.0' })
    })
  });

  assert.equal(result.updateAvailable, false);
});

test('can opt in to prerelease checks using the releases list endpoint', async () => {
  const result = await checkForUpdates({
    currentVersion: '0.2.0',
    includePrereleases: true,
    fetchImpl: async (url) => {
      assert.match(url, /\/releases$/);
      return {
        ok: true,
        json: async () => [
          { tag_name: 'v0.2.1', draft: false, prerelease: false, html_url: 'https://github.com/StrangeQuark/PostMeter/releases/tag/v0.2.1' },
          { tag_name: 'v0.3.0-beta.1', draft: false, prerelease: true, html_url: 'https://github.com/StrangeQuark/PostMeter/releases/tag/v0.3.0-beta.1' },
          { tag_name: 'v0.4.0', draft: true, prerelease: false, html_url: 'https://github.com/StrangeQuark/PostMeter/releases/tag/v0.4.0' }
        ]
      };
    }
  });

  assert.equal(result.updateAvailable, true);
  assert.equal(result.latestVersion, '0.3.0');
  assert.equal(result.prerelease, true);
  assert.equal(result.includePrereleases, true);
});

test('reports no update when prerelease listing has no usable newer release', async () => {
  const result = await checkForUpdates({
    currentVersion: '0.3.0',
    includePrereleases: true,
    fetchImpl: async () => ({
      ok: true,
      json: async () => [
        { tag_name: 'v0.2.9', draft: false, prerelease: false },
        { tag_name: 'v0.4.0-beta.1', draft: true, prerelease: true },
        { tag_name: 'not-a-version', draft: false, prerelease: false }
      ]
    })
  });

  assert.equal(result.updateAvailable, false);
  assert.equal(result.latestVersion, '0.3.0');
  assert.equal(result.releaseUrl, '');
});

test('fails update checks on HTTP errors and malformed release metadata', async () => {
  await assert.rejects(() => checkForUpdates({
    currentVersion: '0.2.0',
    fetchImpl: async () => ({ ok: false, status: 503 })
  }), /HTTP 503/);

  await assert.rejects(() => checkForUpdates({
    currentVersion: '0.2.0',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/StrangeQuark/PostMeter/releases/latest' })
    })
  }), /release version/);
});
