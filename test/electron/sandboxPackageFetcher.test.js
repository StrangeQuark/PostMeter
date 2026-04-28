const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const zlib = require('node:zlib');
const {
  fetchSandboxPackageForReview,
  parseSandboxPackageSpecifier
} = require('../../src/core/sandboxPackageFetcher');
const {
  scriptPackageBundleIntegrity,
  scriptPackageIntegrity
} = require('../../src/core/sandboxPackageCache');

test('fetches an exact npm package into a reviewed cache entry without script-time network access', async () => {
  const source = 'const lodash = require("lodash"); const value = require("./lib/value"); module.exports = { ok: () => lodash.camelCase(value.label) };';
  const tarball = createPackageTarball({
    'package/package.json': JSON.stringify({
      name: '@postmeter/fetched',
      version: '1.2.3',
      main: 'index.js',
      dependencies: { lodash: '^4.17.21', leftpad: '^1.0.0' }
    }),
    'package/index.js': source,
    'package/lib/value.js': 'exports.label = "hello world";'
  });
  const fetchCalls = [];
  const fetched = await fetchSandboxPackageForReview('npm:@postmeter/fetched@1.2.3', {
    fetchImpl: async (url) => {
      fetchCalls.push(url);
      if (url === 'https://registry.npmjs.org/%40postmeter%2Ffetched') {
        return response(JSON.stringify({
          versions: {
            '1.2.3': {
              dependencies: { lodash: '^4.17.21', leftpad: '^1.0.0' },
              dist: {
                integrity: 'sha512-registry',
                tarball: 'https://registry.npmjs.org/@postmeter/fetched/-/fetched-1.2.3.tgz'
              }
            }
          }
        }), { contentType: 'application/json', url });
      }
      if (url === 'https://registry.npmjs.org/@postmeter/fetched/-/fetched-1.2.3.tgz') {
        return response(tarball, { contentType: 'application/octet-stream', url });
      }
      throw new Error(`unexpected URL ${url}`);
    }
  });

  assert.deepEqual(fetchCalls, [
    'https://registry.npmjs.org/%40postmeter%2Ffetched',
    'https://registry.npmjs.org/@postmeter/fetched/-/fetched-1.2.3.tgz'
  ]);
  assert.equal(fetched.specifier, 'npm:@postmeter/fetched@1.2.3');
  assert.equal(fetched.registry, 'npm');
  assert.equal(fetched.entrypoint, 'index.js');
  assert.equal(fetched.source, source);
  assert.equal(fetched.integrity, scriptPackageBundleIntegrity(fetched));
  assert.deepEqual(fetched.files.map((file) => file.path), ['index.js', 'lib/value.js', 'package.json']);
  assert.equal(fetched.packageJson.name, '@postmeter/fetched');
  assert.deepEqual(fetched.dependencies, ['lodash']);
  assert.deepEqual(fetched.packageDependencies, ['leftpad', 'lodash']);
});

test('fetches an exact JSR package and verifies the registry checksum', async () => {
  const source = 'export function ok() { return true; }';
  const checksum = `sha256-${crypto.createHash('sha256').update(source, 'utf8').digest('hex')}`;
  const fetched = await fetchSandboxPackageForReview('jsr:@postmeter/tools@1.0.0', {
    fetchImpl: async (url) => {
      if (url === 'https://jsr.io/@postmeter/tools/1.0.0_meta.json') {
        return response(JSON.stringify({
          exports: { '.': './mod.js' },
          manifest: {
            '/mod.js': { checksum, size: source.length }
          }
        }), { contentType: 'application/json', url });
      }
      if (url === 'https://jsr.io/@postmeter/tools/1.0.0/mod.js') {
        return response(source, { contentType: 'application/javascript', url });
      }
      throw new Error(`unexpected URL ${url}`);
    }
  });

  assert.equal(fetched.specifier, 'jsr:@postmeter/tools@1.0.0');
  assert.equal(fetched.registry, 'jsr');
  assert.equal(fetched.entrypoint, 'mod.js');
  assert.equal(fetched.integrity, scriptPackageBundleIntegrity(fetched));
  assert.deepEqual(fetched.files.map((file) => file.path), ['mod.js']);
});

test('resolves unversioned external package imports to reviewed latest-version cache entries', async () => {
  const npmSource = 'module.exports = { npm: true };';
  const tarball = createPackageTarball({
    'package/package.json': JSON.stringify({
      name: 'latest-pkg',
      version: '2.0.0',
      main: 'index.js'
    }),
    'package/index.js': npmSource
  });
  const npmFetched = await fetchSandboxPackageForReview('npm:latest-pkg', {
    fetchImpl: async (url) => {
      if (url === 'https://registry.npmjs.org/latest-pkg') {
        return response(JSON.stringify({
          'dist-tags': { latest: '2.0.0' },
          versions: {
            '2.0.0': {
              dist: {
                integrity: 'sha512-latest',
                tarball: 'https://registry.npmjs.org/latest-pkg/-/latest-pkg-2.0.0.tgz'
              }
            }
          }
        }), { contentType: 'application/json', url });
      }
      if (url === 'https://registry.npmjs.org/latest-pkg/-/latest-pkg-2.0.0.tgz') {
        return response(tarball, { contentType: 'application/octet-stream', url });
      }
      throw new Error(`unexpected URL ${url}`);
    }
  });

  assert.equal(npmFetched.specifier, 'npm:latest-pkg');
  assert.equal(npmFetched.packageVersion, '2.0.0');
  assert.equal(npmFetched.packageJson.version, '2.0.0');
  assert.equal(npmFetched.integrity, scriptPackageBundleIntegrity(npmFetched));

  const jsrSource = 'export const jsr = true;';
  const checksum = `sha256-${crypto.createHash('sha256').update(jsrSource, 'utf8').digest('hex')}`;
  const jsrFetched = await fetchSandboxPackageForReview('jsr:@postmeter/latest', {
    fetchImpl: async (url) => {
      if (url === 'https://jsr.io/@postmeter/latest/meta.json') {
        return response(JSON.stringify({ latest: '1.1.0' }), { contentType: 'application/json', url });
      }
      if (url === 'https://jsr.io/@postmeter/latest/1.1.0_meta.json') {
        return response(JSON.stringify({
          exports: { '.': './mod.js' },
          manifest: {
            '/mod.js': { checksum, size: jsrSource.length }
          }
        }), { contentType: 'application/json', url });
      }
      if (url === 'https://jsr.io/@postmeter/latest/1.1.0/mod.js') {
        return response(jsrSource, { contentType: 'application/javascript', url });
      }
      throw new Error(`unexpected URL ${url}`);
    }
  });

  assert.equal(jsrFetched.specifier, 'jsr:@postmeter/latest');
  assert.equal(jsrFetched.packageVersion, '1.1.0');
  assert.equal(jsrFetched.packageJson.version, '1.1.0');
  assert.equal(jsrFetched.integrity, scriptPackageBundleIntegrity(jsrFetched));
});

test('fetches a team package from an explicitly reviewed HTTPS source URL', async () => {
  const source = 'module.exports = { team: true };';
  const fetched = await fetchSandboxPackageForReview('@postmeter/tools', {
    fetchImpl: async (url) => {
      assert.equal(url, 'https://packages.example.test/postmeter-tools.json');
      return response(JSON.stringify({
        dependencies: ['uuid', 'node:fs'],
        entrypoint: 'tools.js',
        source
      }), { contentType: 'application/json', url });
    },
    sourceUrl: 'https://packages.example.test/postmeter-tools.json'
  });

  assert.equal(fetched.specifier, '@postmeter/tools');
  assert.equal(fetched.registry, 'team');
  assert.equal(fetched.entrypoint, 'tools.js');
  assert.equal(fetched.sourceUrl, 'https://packages.example.test/postmeter-tools.json');
  assert.deepEqual(fetched.dependencies, ['uuid']);
  assert.equal(fetched.integrity, scriptPackageBundleIntegrity(fetched));
});

test('rejects unsafe and redirected package fetches', async () => {
  assert.deepEqual(parseSandboxPackageSpecifier('npm:left-pad'), {
    registry: 'npm',
    packageName: 'left-pad',
    specifier: 'npm:left-pad',
    version: ''
  });
  await assert.rejects(
    () => fetchSandboxPackageForReview('@postmeter/tools', {
      fetchImpl: async () => response('module.exports = {};'),
      sourceUrl: 'http://packages.example.test/tools.js'
    }),
    /only allows HTTPS URLs/
  );
  await assert.rejects(
    () => fetchSandboxPackageForReview('npm:left-pad@1.3.0', {
      fetchImpl: async (url) => {
        if (url === 'https://registry.npmjs.org/left-pad') {
          return response(JSON.stringify({
            versions: {
              '1.3.0': {
                dist: { tarball: 'https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz' }
              }
            }
          }), { url });
        }
        return redirect('https://evil.example.test/package.tgz', { url });
      }
    }),
    /not allowed: evil\.example\.test/
  );
});

function response(body, options = {}) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ''), 'utf8');
  const headers = new Map([
    ['content-length', String(buffer.length)],
    ['content-type', options.contentType || 'text/plain']
  ]);
  return {
    ok: true,
    status: 200,
    url: options.url || '',
    headers: {
      get(name) {
        return headers.get(String(name || '').toLowerCase()) || null;
      }
    },
    async arrayBuffer() {
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
  };
}

function redirect(location, options = {}) {
  return {
    ok: false,
    status: 302,
    url: options.url || '',
    headers: {
      get(name) {
        return String(name || '').toLowerCase() === 'location' ? location : null;
      }
    },
    async arrayBuffer() {
      return new ArrayBuffer(0);
    }
  };
}

function createPackageTarball(files) {
  const chunks = [];
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, 'utf8');
    const header = Buffer.alloc(512);
    header.write(name, 0, Math.min(Buffer.byteLength(name), 100), 'utf8');
    writeTarOctal(header, 100, 8, 0o644);
    writeTarOctal(header, 108, 8, 0);
    writeTarOctal(header, 116, 8, 0);
    writeTarOctal(header, 124, 12, data.length);
    writeTarOctal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header[156] = '0'.charCodeAt(0);
    header.write('ustar', 257, 5, 'utf8');
    header.write('00', 263, 2, 'utf8');
    const checksum = [...header].reduce((sum, byte) => sum + byte, 0);
    writeTarOctal(header, 148, 8, checksum);
    chunks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  chunks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(chunks));
}

function writeTarOctal(buffer, offset, length, value) {
  const text = value.toString(8).padStart(length - 1, '0').slice(-(length - 1));
  buffer.write(`${text}\0`, offset, length, 'ascii');
}
