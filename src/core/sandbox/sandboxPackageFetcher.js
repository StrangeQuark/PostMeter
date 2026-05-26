const zlib = require('node:zlib');
const {
  scriptPackageBundleIntegrity,
  scriptPackageIntegrity
} = require('./sandboxPackageCache');
const { assertPublicHttpsUrl } = require('../security/networkPolicy');

const EXACT_VERSION_SOURCE = String.raw`(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?`;
const REVIEWED_PACKAGE_SPECIFIER_PATTERN = new RegExp(String.raw`^(?:npm:(?:@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9._-]+)@${EXACT_VERSION_SOURCE}|jsr:@[a-z0-9._-]+\/[a-z0-9._-]+@${EXACT_VERSION_SOURCE}|@[a-z0-9._-]+\/[a-z0-9._-]+)$`, 'i');
const TEAM_PACKAGE_PATTERN = /^@[a-z0-9._-]+\/[a-z0-9._-]+$/i;
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9._-]+)$/i;
const VERSION_PATTERN = new RegExp(`^${EXACT_VERSION_SOURCE}$`);
const MAX_PACKAGE_SOURCE_BYTES = 128 * 1024;
const MAX_PACKAGE_FETCH_BYTES = 50 * 1024 * 1024;
const MAX_REGISTRY_METADATA_BYTES = 2 * 1024 * 1024;
const MAX_TAR_ENTRIES = 2048;
const MAX_REVIEWED_PACKAGE_FILES = 128;
const FETCH_TIMEOUT_MILLIS = 30_000;
const REDIRECT_LIMIT = 3;
const REVIEWED_DEPENDENCY_ALLOWLIST = new Set([
  'ajv',
  'assert',
  'buffer',
  'chai',
  'cheerio',
  'crypto-js',
  'csv-parse/lib/sync',
  'events',
  'lodash',
  'moment',
  'path',
  'postman-collection',
  'punycode',
  'querystring',
  'stream',
  'string-decoder',
  'timers',
  'url',
  'util',
  'uuid',
  'xml2js'
]);

async function fetchSandboxPackageForReview(specifier, options = {}) {
  const parsed = parseSandboxPackageSpecifier(specifier);
  if (parsed.registry === 'team') {
    return fetchTeamPackageForReview(parsed, options);
  }
  if (parsed.registry === 'npm') {
    return fetchNpmPackageForReview(parsed, options);
  }
  if (parsed.registry === 'jsr') {
    return fetchJsrPackageForReview(parsed, options);
  }
  throw new Error(`Unsupported sandbox package registry "${parsed.registry}".`);
}

function parseSandboxPackageSpecifier(specifier) {
  const value = String(specifier || '').trim();
  if (!REVIEWED_PACKAGE_SPECIFIER_PATTERN.test(value)) {
    throw new Error('Package fetch requires @team/package, npm:package@version, npm:@scope/package@version, or jsr:@scope/package@version. npm and JSR package versions must be exact.');
  }
  if (TEAM_PACKAGE_PATTERN.test(value)) {
    return {
      registry: 'team',
      packageName: value,
      specifier: value,
      version: ''
    };
  }
  const separator = value.indexOf(':');
  const registry = value.slice(0, separator).toLowerCase();
  const rawNameAndVersion = value.slice(separator + 1);
  const versionSeparator = rawNameAndVersion.lastIndexOf('@');
  const hasVersion = versionSeparator > 0;
  const packageName = hasVersion ? rawNameAndVersion.slice(0, versionSeparator) : rawNameAndVersion;
  const version = hasVersion ? rawNameAndVersion.slice(versionSeparator + 1) : '';
  if (!PACKAGE_NAME_PATTERN.test(packageName) || !VERSION_PATTERN.test(version)) {
    if (version) {
      throw new Error(`${registry} package references must use an exact package name and version.`);
    }
    if (!PACKAGE_NAME_PATTERN.test(packageName)) {
      throw new Error(`${registry} package references must use a supported package name.`);
    }
  }
  if (registry === 'jsr' && !packageName.startsWith('@')) {
    throw new Error('JSR package fetch requires a scoped package name such as jsr:@scope/package@version.');
  }
  return {
    registry,
    packageName,
    specifier: value,
    version
  };
}

async function fetchNpmPackageForReview(parsed, options = {}) {
  const metadataUrl = `https://registry.npmjs.org/${encodeURIComponent(parsed.packageName)}`;
  const metadata = parseJson(await fetchText(metadataUrl, {
    ...options,
    allowedUrl: isNpmRegistryUrl,
    headers: { accept: 'application/json' },
    maxBytes: MAX_REGISTRY_METADATA_BYTES
  }), `npm package metadata for ${parsed.packageName}`);
  const resolvedVersion = parsed.version;
  const resolved = { ...parsed, version: resolvedVersion };
  const versionInfo = metadata?.versions?.[resolved.version];
  if (!versionInfo) {
    throw new Error(`npm package ${parsed.packageName}@${resolved.version} was not found.`);
  }
  const tarballUrl = String(versionInfo.dist?.tarball || '');
  if (!tarballUrl) {
    throw new Error(`npm package ${parsed.packageName}@${resolved.version} does not expose a tarball.`);
  }
  const tarball = await fetchBytes(tarballUrl, {
    ...options,
    allowedUrl: isNpmRegistryUrl,
    headers: { accept: 'application/octet-stream' },
    maxBytes: MAX_PACKAGE_FETCH_BYTES
  });
  const packageData = await packageDataFromNpmTarball(tarball, resolved);
  const dependencies = supportedPackageDependencies(versionInfo);
  return reviewedCacheEntry(resolved, {
    dependencies,
    entrypoint: packageData.entrypoint,
    files: packageData.files,
    packageJson: packageData.packageJson,
    packageDependencies: Object.keys(versionInfo.dependencies || {}).sort(),
    packageIntegrity: String(versionInfo.dist?.integrity || versionInfo.dist?.shasum || ''),
    registry: 'npm',
    source: packageData.source,
    sourceUrl: tarballUrl
  });
}

async function fetchJsrPackageForReview(parsed, options = {}) {
  const [scope, name] = splitScopedPackageName(parsed.packageName);
  const resolvedVersion = parsed.version;
  const resolved = { ...parsed, version: resolvedVersion };
  const metadataUrl = `https://jsr.io/@${encodeURIComponent(scope)}/${encodeURIComponent(name)}/${encodeURIComponent(resolved.version)}_meta.json`;
  const metadata = parseJson(await fetchText(metadataUrl, {
    ...options,
    allowedUrl: isJsrRegistryUrl,
    headers: { accept: 'application/json' },
    maxBytes: MAX_REGISTRY_METADATA_BYTES
  }), `JSR package metadata for ${parsed.packageName}@${resolved.version}`);
  const entrypoint = normalizePackageEntryPath(entrypointFromExports(metadata?.exports) || 'mod.ts');
  const manifestEntry = metadata?.manifest?.[`/${entrypoint}`];
  if (!entrypoint || !manifestEntry) {
    throw new Error(`JSR package ${parsed.packageName}@${resolved.version} does not expose a supported entrypoint.`);
  }
  const sourceUrl = `https://jsr.io/@${encodeURIComponent(scope)}/${encodeURIComponent(name)}/${encodeURIComponent(resolved.version)}/${entrypoint.split('/').map(encodeURIComponent).join('/')}`;
  const source = await fetchText(sourceUrl, {
    ...options,
    allowedUrl: isJsrRegistryUrl,
    headers: { accept: 'application/javascript, text/javascript, application/typescript, text/plain;q=0.8, */*;q=0.1' },
    maxBytes: MAX_PACKAGE_SOURCE_BYTES
  });
  verifyJsrChecksum(source, manifestEntry.checksum, resolved, entrypoint);
  return reviewedCacheEntry(resolved, {
    dependencies: [],
    entrypoint,
    files: [{ path: entrypoint, source }],
    packageDependencies: [],
    packageIntegrity: String(manifestEntry.checksum || ''),
    packageJson: { exports: metadata?.exports || {}, name: parsed.packageName, version: resolved.version },
    registry: 'jsr',
    source,
    sourceUrl
  });
}

async function fetchTeamPackageForReview(parsed, options = {}) {
  const sourceUrl = String(options.sourceUrl || '').trim();
  if (!sourceUrl) {
    throw new Error('Team package fetch requires a reviewed HTTPS source URL for the package source or source JSON.');
  }
  const bytes = await fetchBytes(sourceUrl, {
    ...options,
    allowedUrl: isSafeUserProvidedPackageUrl,
    headers: { accept: 'application/json, application/javascript, text/javascript, text/plain;q=0.8, */*;q=0.1' },
    maxBytes: MAX_PACKAGE_SOURCE_BYTES
  });
  const contentType = String(options.contentType || '').trim();
  const payload = decodeTeamPackagePayload(bytes.toString('utf8'), contentType);
  return reviewedCacheEntry(parsed, {
    dependencies: payload.dependencies,
    entrypoint: payload.entrypoint,
    files: payload.files,
    packageJson: payload.packageJson,
    packageDependencies: payload.dependencies,
    packageIntegrity: '',
    registry: 'team',
    source: payload.source,
    sourceUrl
  });
}

function reviewedCacheEntry(parsed, details = {}) {
  const source = assertReviewSource(details.source, parsed.specifier);
  const dependencies = normalizeReviewDependencies(details.dependencies || []);
  const files = normalizeReviewFiles(details.files || [], details.entrypoint || '', source);
  const packageJson = normalizeReviewPackageJson(details.packageJson, parsed, details.entrypoint);
  const now = new Date().toISOString();
  const entry = {
    dependencies,
    entrypoint: String(details.entrypoint || '').slice(0, 256),
    files,
    fetchedAt: now,
    maxExportKeys: 64,
    packageDependencies: Array.isArray(details.packageDependencies)
      ? details.packageDependencies.map((item) => String(item || '')).filter(Boolean).slice(0, 64)
      : [],
    packageIntegrity: String(details.packageIntegrity || '').slice(0, 512),
    packageJson,
    packageName: parsed.packageName,
    packageVersion: parsed.version,
    registry: String(details.registry || parsed.registry),
    source,
    sourceUrl: String(details.sourceUrl || '').slice(0, 2048),
    specifier: parsed.specifier
  };
  entry.integrity = files.length > 0 || Object.keys(packageJson).length > 0
    ? scriptPackageBundleIntegrity(entry)
    : scriptPackageIntegrity(source);
  return entry;
}

function assertReviewSource(source, specifier) {
  const value = String(source || '');
  if (!value.trim()) {
    throw new Error(`Fetched package "${specifier}" did not contain source code.`);
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_PACKAGE_SOURCE_BYTES) {
    throw new Error(`Fetched package "${specifier}" exceeds the reviewed package source limit.`);
  }
  return value;
}

function normalizeReviewDependencies(dependencies) {
  const output = [];
  const seen = new Set();
  for (const dependency of Array.isArray(dependencies) ? dependencies : []) {
    const name = String(dependency || '').trim();
    if (!name || seen.has(name)) {
      continue;
    }
    if (!REVIEWED_DEPENDENCY_ALLOWLIST.has(name) && !REVIEWED_PACKAGE_SPECIFIER_PATTERN.test(name)) {
      continue;
    }
    seen.add(name);
    output.push(name);
    if (output.length >= 32) {
      break;
    }
  }
  return output;
}

function normalizeReviewFiles(files, entrypoint, source) {
  const entries = Array.isArray(files)
    ? files.map((file) => [
      file?.path ?? file?.name ?? file?.filename,
      file?.source ?? file?.code ?? file?.text
    ])
    : Object.entries(files || {});
  const output = [];
  const seen = new Set();
  for (const [rawPath, rawSource] of entries) {
    const filePath = normalizePackageEntryPath(rawPath);
    if (!filePath || seen.has(filePath)) {
      continue;
    }
    seen.add(filePath);
    output.push({
      path: filePath,
      source: String(rawSource ?? '')
    });
    if (output.length >= MAX_REVIEWED_PACKAGE_FILES) {
      break;
    }
  }
  const normalizedEntry = normalizePackageEntryPath(entrypoint);
  if (normalizedEntry && source && !seen.has(normalizedEntry)) {
    output.push({ path: normalizedEntry, source });
  }
  return output.sort((left, right) => left.path.localeCompare(right.path));
}

function normalizeReviewPackageJson(packageJson, parsed, entrypoint) {
  const base = packageJson && typeof packageJson === 'object' && !Array.isArray(packageJson)
    ? packageJson
    : {};
  const output = {
    ...base,
    name: base.name || parsed.packageName
  };
  if (base.main || entrypoint) {
    output.main = base.main || entrypoint;
  }
  if (base.version || parsed.version) {
    output.version = base.version || parsed.version;
  }
  return output;
}

function supportedPackageDependencies(versionInfo = {}) {
  return Object.keys(versionInfo.dependencies || {})
    .filter((dependency) => REVIEWED_DEPENDENCY_ALLOWLIST.has(dependency))
    .sort();
}

async function packageDataFromNpmTarball(tarball, parsed) {
  const unpacked = await gunzipBounded(tarball, MAX_PACKAGE_FETCH_BYTES);
  const entries = extractTarEntries(unpacked);
  const packageJsonText = readTarEntryText(entries, 'package.json');
  if (!packageJsonText) {
    throw new Error(`npm package ${parsed.packageName}@${parsed.version} does not include package.json.`);
  }
  const packageJson = parseJson(packageJsonText, `package.json for ${parsed.packageName}@${parsed.version}`);
  const candidates = entrypointCandidates(packageJson);
  const entrypoint = resolveTarEntrypoint(entries, candidates);
  if (!entrypoint) {
    throw new Error(`npm package ${parsed.packageName}@${parsed.version} does not expose a supported JavaScript entrypoint.`);
  }
  const files = packageFilesFromTarEntries(entries);
  return {
    entrypoint,
    files,
    packageJson,
    source: readTarEntryText(entries, entrypoint)
  };
}

function packageFilesFromTarEntries(entries) {
  const files = [];
  let totalBytes = 0;
  for (const [entryPath, value] of [...entries.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
    if (!reviewedPackageFileSupported(entryPath)) {
      continue;
    }
    totalBytes += value.length;
    if (totalBytes > MAX_PACKAGE_SOURCE_BYTES) {
      throw new Error(`Fetched package exceeds the reviewed package source limit.`);
    }
    files.push({
      path: entryPath,
      source: value.toString('utf8')
    });
    if (files.length > MAX_REVIEWED_PACKAGE_FILES) {
      throw new Error(`Fetched package contains too many reviewed source files.`);
    }
  }
  return files;
}

function reviewedPackageFileSupported(entryPath) {
  const value = normalizePackageEntryPath(entryPath);
  return Boolean(value)
    && !value.split('/').includes('node_modules')
    && /\.(?:json|[cm]?js)$/i.test(value);
}

function entrypointCandidates(packageJson = {}) {
  return [
    entrypointFromBrowser(packageJson.browser),
    entrypointFromExports(packageJson.exports),
    packageJson.main,
    packageJson.module,
    'index.js'
  ].map(normalizePackageEntryPath).filter(Boolean);
}

function entrypointFromBrowser(browser) {
  if (typeof browser === 'string') {
    return browser;
  }
  if (browser && typeof browser === 'object' && typeof browser['.'] === 'string') {
    return browser['.'];
  }
  return '';
}

function entrypointFromExports(exportsField) {
  if (typeof exportsField === 'string') {
    return exportsField;
  }
  if (!exportsField || typeof exportsField !== 'object') {
    return '';
  }
  if (exportsField['.']) {
    return entrypointFromExportValue(exportsField['.']);
  }
  return entrypointFromExportValue(exportsField);
}

function entrypointFromExportValue(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (!value || typeof value !== 'object') {
    return '';
  }
  for (const key of ['browser', 'require', 'default', 'import', 'node']) {
    const nested = entrypointFromExportValue(value[key]);
    if (nested) {
      return nested;
    }
  }
  return '';
}

function normalizePackageEntryPath(entryPath) {
  let value = String(entryPath || '').trim();
  if (!value) {
    return '';
  }
  while (value.startsWith('./')) {
    value = value.slice(2);
  }
  value = value.replace(/^\/+/, '');
  if (!value || value.includes('\0') || value.split('/').includes('..')) {
    return '';
  }
  return value;
}

function resolveTarEntrypoint(entries, candidates) {
  for (const candidate of candidates) {
    for (const expanded of entrypointPathVariants(candidate)) {
      if (entries.has(expanded)) {
        return expanded;
      }
    }
  }
  return '';
}

function entrypointPathVariants(candidate) {
  const value = normalizePackageEntryPath(candidate);
  if (!value) {
    return [];
  }
  const variants = [value];
  if (!/\.[cm]?js$/i.test(value)) {
    variants.push(`${value}.js`, `${value}.cjs`, `${value}.mjs`, `${value}/index.js`);
  }
  return variants;
}

function readTarEntryText(entries, name) {
  const value = entries.get(normalizePackageEntryPath(name));
  return value ? value.toString('utf8') : '';
}

function extractTarEntries(buffer) {
  const entries = new Map();
  let offset = 0;
  let pendingLongName = '';
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (isZeroBlock(header)) {
      break;
    }
    const name = pendingLongName || tarString(header, 0, 100);
    pendingLongName = '';
    const prefix = tarString(header, 345, 155);
    const type = String.fromCharCode(header[156] || 0);
    const size = tarOctal(header, 124, 12);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > buffer.length) {
      throw new Error('Package tarball is truncated.');
    }
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === 'L') {
      pendingLongName = data.toString('utf8').replace(/\0.*$/s, '');
    } else if (type === '0' || type === '\0' || type === '') {
      const fullName = normalizeTarEntryName(prefix ? `${prefix}/${name}` : name);
      if (fullName) {
        entries.set(fullName, Buffer.from(data));
        if (entries.size > MAX_TAR_ENTRIES) {
          throw new Error('Package tarball contains too many files.');
        }
      }
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function normalizeTarEntryName(name) {
  let value = String(name || '').replace(/\\/g, '/').replace(/^package\//, '');
  value = normalizePackageEntryPath(value);
  return value;
}

function tarString(buffer, start, length) {
  return buffer.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '').trim();
}

function tarOctal(buffer, start, length) {
  const value = buffer.subarray(start, start + length).toString('utf8').replace(/\0/g, '').trim();
  return value ? Number.parseInt(value, 8) : 0;
}

function isZeroBlock(buffer) {
  for (const byte of buffer) {
    if (byte !== 0) {
      return false;
    }
  }
  return true;
}

function gunzipBounded(buffer, maxBytes) {
  return new Promise((resolve, reject) => {
    const gunzip = zlib.createGunzip();
    const chunks = [];
    let total = 0;
    gunzip.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        gunzip.destroy(new Error('Package tarball expands beyond the fetch limit.'));
        return;
      }
      chunks.push(chunk);
    });
    gunzip.on('error', reject);
    gunzip.on('end', () => resolve(Buffer.concat(chunks, total)));
    gunzip.end(buffer);
  });
}

function decodeTeamPackagePayload(text, contentType = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return { dependencies: [], entrypoint: '', source: '' };
  }
  const looksJson = /json/i.test(contentType) || trimmed.startsWith('{');
  if (looksJson) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && (parsed.source != null || parsed.code != null || parsed.files != null)) {
        return {
          dependencies: Array.isArray(parsed.dependencies) ? parsed.dependencies : [],
          entrypoint: parsed.entrypoint == null ? '' : String(parsed.entrypoint),
          files: parsed.files || [],
          packageJson: parsed.packageJson || parsed.package || parsed.manifest || {},
          source: String(parsed.source ?? parsed.code ?? '')
        };
      }
    } catch {
      // Fall through and treat the payload as raw JavaScript source.
    }
  }
  return { dependencies: [], entrypoint: '', files: [], packageJson: {}, source: text };
}

async function fetchText(url, options = {}) {
  return (await fetchBytes(url, options)).toString('utf8');
}

async function fetchBytes(url, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Package fetch requires a runtime with fetch support.');
  }
  const maxBytes = Number(options.maxBytes || MAX_PACKAGE_FETCH_BYTES);
  const allowedUrl = typeof options.allowedUrl === 'function' ? options.allowedUrl : isSafeUserProvidedPackageUrl;
  let nextUrl = new URL(String(url || ''));
  for (let redirectCount = 0; redirectCount <= REDIRECT_LIMIT; redirectCount += 1) {
    await assertAllowedFetchUrl(nextUrl, allowedUrl, options);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(options.timeoutMillis || FETCH_TIMEOUT_MILLIS));
    let response;
    try {
      response = await fetchImpl(nextUrl.toString(), {
        headers: options.headers || {},
        redirect: 'manual',
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers?.get?.('location');
      if (!location) {
        throw new Error(`Package fetch redirect from ${nextUrl.hostname} did not include a location.`);
      }
      nextUrl = new URL(location, nextUrl);
      continue;
    }
    if (!response.ok) {
      throw new Error(`Package fetch failed with HTTP ${response.status}.`);
    }
    if (response.url) {
      await assertAllowedFetchUrl(new URL(response.url), allowedUrl, options);
    }
    return readResponseBytes(response, maxBytes);
  }
  throw new Error('Package fetch exceeded the redirect limit.');
}

async function readResponseBytes(response, maxBytes) {
  const contentLength = Number(response.headers?.get?.('content-length') || 0);
  if (contentLength > maxBytes) {
    throw new Error('Package fetch response exceeds the size limit.');
  }
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) {
        throw new Error('Package fetch response exceeds the size limit.');
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, total);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length > maxBytes) {
    throw new Error('Package fetch response exceeds the size limit.');
  }
  return buffer;
}

async function assertAllowedFetchUrl(url, allowedUrl, options = {}) {
  if (url.protocol !== 'https:') {
    throw new Error('Package fetch only allows HTTPS URLs.');
  }
  if (allowedUrl === isSafeUserProvidedPackageUrl) {
    await assertPublicHttpsUrl(url, {
      allowedHosts: options.allowedTeamPackageHosts || options.allowedHosts,
      resolveHost: options.resolveHost
    });
    return;
  }
  if (!allowedUrl(url)) {
    throw new Error(`Package fetch URL is not allowed: ${url.hostname}`);
  }
}

function isNpmRegistryUrl(url) {
  return url.protocol === 'https:' && url.hostname === 'registry.npmjs.org';
}

function isJsrRegistryUrl(url) {
  return url.protocol === 'https:' && url.hostname === 'jsr.io';
}

function isSafeUserProvidedPackageUrl(url) {
  if (url.protocol !== 'https:') {
    return false;
  }
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    return false;
  }
  if (hostname.includes(':') || isPrivateIpv4(hostname) || hostname === '::1' || hostname === '[::1]') {
    return false;
  }
  return true;
}

function isPrivateIpv4(hostname) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return false;
  }
  const parts = hostname.split('.').map(Number);
  if (parts.some((part) => part < 0 || part > 255 || !Number.isInteger(part))) {
    return true;
  }
  return parts[0] === 10
    || parts[0] === 127
    || parts[0] === 0
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

function splitScopedPackageName(packageName) {
  const match = /^@([^/]+)\/(.+)$/.exec(packageName);
  if (!match) {
    throw new Error(`Package ${packageName} is not scoped.`);
  }
  return [match[1], match[2]];
}

function verifyJsrChecksum(source, checksum, parsed, entrypoint) {
  const value = String(checksum || '');
  if (!value.startsWith('sha256-')) {
    return;
  }
  const expected = value.slice('sha256-'.length);
  const actual = require('node:crypto').createHash('sha256').update(String(source || ''), 'utf8').digest('hex');
  if (expected && expected !== actual) {
    throw new Error(`JSR package ${parsed.packageName}@${parsed.version} entrypoint ${entrypoint} checksum does not match.`);
  }
}

function parseJson(text, label) {
  try {
    return JSON.parse(String(text || ''));
  } catch (error) {
    throw new Error(`Could not parse ${label}: ${error.message || String(error)}`);
  }
}

module.exports = {
  MAX_PACKAGE_SOURCE_BYTES,
  fetchSandboxPackageForReview,
  parseSandboxPackageSpecifier
};
