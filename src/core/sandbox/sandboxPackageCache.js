const crypto = require('node:crypto');

const PACKAGE_REF_PATTERN = /\b(?:pm\.)?require\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
const EXACT_VERSION_SOURCE = String.raw`(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?`;
const REVIEWED_PACKAGE_SPECIFIER_PATTERN = new RegExp(String.raw`^(?:npm:(?:@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9._-]+)@${EXACT_VERSION_SOURCE}|jsr:@[a-z0-9._-]+\/[a-z0-9._-]+@${EXACT_VERSION_SOURCE}|@[a-z0-9._-]+\/[a-z0-9._-]+)$`, 'i');
const EXTERNAL_PACKAGE_PREFIX_PATTERN = /^(?:npm:|jsr:|@)/i;

function collectSandboxPackageReferencesFromCollection(collection = {}) {
  const references = new Map();
  for (const source of requestScriptSources(collection)) {
    collectSandboxPackageReferencesFromText(source, references);
  }
  const visitRequest = (request = {}) => {
    for (const source of requestScriptSources(request)) {
      collectSandboxPackageReferencesFromText(source, references);
    }
  };
  const visitFolder = (folder = {}) => {
    for (const source of requestScriptSources(folder)) {
      collectSandboxPackageReferencesFromText(source, references);
    }
    for (const request of folder.requests || []) {
      visitRequest(request);
    }
    for (const child of folder.folders || []) {
      visitFolder(child);
    }
  };
  for (const request of collection.requests || []) {
    visitRequest(request);
  }
  for (const folder of collection.folders || []) {
    visitFolder(folder);
  }
  return [...references.values()].sort((left, right) => left.specifier.localeCompare(right.specifier));
}

function requestScriptSources(request = {}) {
  const scripts = request.scripts || {};
  return [
    scripts.preRequest,
    scripts.tests,
    scripts.beforeQuery,
    scripts.afterResponse,
    scripts.beforeInvoke,
    scripts.onMessage,
    scripts.onIncomingMessage,
    scripts.mock
  ].filter((source) => String(source || '').trim());
}

function collectSandboxPackageReferencesFromWorkspace(workspace = {}) {
  const references = new Map();
  for (const collection of workspace.collections || []) {
    for (const reference of collectSandboxPackageReferencesFromCollection(collection)) {
      mergePackageReference(references, reference);
    }
  }
  return [...references.values()].sort((left, right) => left.specifier.localeCompare(right.specifier));
}

function collectSandboxPackageReferencesFromText(source = '', references = new Map()) {
  const text = String(source || '');
  let match;
  while ((match = PACKAGE_REF_PATTERN.exec(text)) !== null) {
    const specifier = String(match[2] || '').trim();
    if (!isExternalSandboxPackageSpecifier(specifier)) {
      continue;
    }
    mergePackageReference(references, packageReferenceForSpecifier(specifier));
  }
  return [...references.values()].sort((left, right) => left.specifier.localeCompare(right.specifier));
}

function packageReferenceForSpecifier(specifier) {
  const reviewed = REVIEWED_PACKAGE_SPECIFIER_PATTERN.test(specifier);
  return {
    pinned: reviewed,
    specifier,
    status: reviewed ? 'missing-review' : 'unpinned-or-invalid'
  };
}

function sandboxPackageCacheStatus(workspace = {}) {
  const references = collectSandboxPackageReferencesFromWorkspace(workspace);
  const cache = normalizePackageCache(workspace.settings?.sandbox?.packageCache || []);
  return references.map((reference) => {
    const cached = cache.get(reference.specifier);
    if (!reference.pinned) {
      return { ...reference, installed: false, validIntegrity: false };
    }
    if (!cached) {
      return { ...reference, installed: false, validIntegrity: false };
    }
    const expected = scriptPackageBundleIntegrity(cached);
    return {
      ...reference,
      installed: true,
      status: cached.integrity === expected ? 'reviewed' : 'integrity-mismatch',
      validIntegrity: cached.integrity === expected
    };
  });
}

function normalizePackageCache(cache = []) {
  const map = new Map();
  for (const item of Array.isArray(cache) ? cache : []) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const specifier = String(item.specifier || item.name || '').trim();
    if (!specifier) {
      continue;
    }
    map.set(specifier, {
      dependencyAliases: normalizeDependencyAliases(item.dependencyAliases || item.dependencyMap),
      dependencies: Array.isArray(item.dependencies) ? item.dependencies.map(String).filter(Boolean) : [],
      entrypoint: item.entrypoint == null ? '' : String(item.entrypoint),
      files: normalizePackageFiles(item.files),
      integrity: String(item.integrity || '').trim(),
      maxExportKeys: Number.isFinite(Number(item.maxExportKeys)) ? Number(item.maxExportKeys) : undefined,
      packageJson: normalizePackageJson(item.packageJson || item.package || item.manifest),
      source: String(item.source || item.code || ''),
      specifier
    });
  }
  return map;
}

function mergePackageReference(references, reference) {
  if (!reference?.specifier || references.has(reference.specifier)) {
    return;
  }
  references.set(reference.specifier, reference);
}

function isExternalSandboxPackageSpecifier(specifier) {
  return EXTERNAL_PACKAGE_PREFIX_PATTERN.test(String(specifier || '').trim());
}

function scriptPackageIntegrity(source) {
  return `sha256-${crypto.createHash('sha256').update(String(source || ''), 'utf8').digest('base64')}`;
}

function scriptPackageBundleIntegrity(entry = {}) {
  const files = normalizePackageFiles(entry.files);
  const packageJson = normalizePackageJson(entry.packageJson || entry.package || entry.manifest);
  const entrypoint = normalizePackageEntrypoint(entry.entrypoint, packageJson);
  if (files.length === 0 && Object.keys(packageJson).length === 0) {
    return scriptPackageIntegrity(entry.source ?? entry.code ?? '');
  }
  if (files.length === 0) {
    files.push({
      path: entrypoint,
      source: String(entry.source ?? entry.code ?? '')
    });
  }
  return scriptPackageIntegrity(JSON.stringify({
    entrypoint,
    files,
    packageJson
  }));
}

function normalizePackageEntrypoint(entrypoint, packageJson = {}) {
  const explicit = normalizePackageFilePath(entrypoint);
  if (explicit) {
    return explicit;
  }
  for (const candidate of [
    entrypointFromBrowserPackageField(packageJson.browser),
    entrypointFromExportsPackageField(packageJson.exports),
    packageJson.main,
    packageJson.module,
    'index.js'
  ]) {
    const normalized = normalizePackageFilePath(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return 'index.js';
}

function entrypointFromBrowserPackageField(browserField) {
  if (typeof browserField === 'string') {
    return browserField;
  }
  if (browserField && typeof browserField === 'object' && typeof browserField['.'] === 'string') {
    return browserField['.'];
  }
  return '';
}

function entrypointFromExportsPackageField(exportsField) {
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

function normalizePackageFiles(files) {
  const output = [];
  const seen = new Set();
  const entries = Array.isArray(files)
    ? files.map((file) => [
      file?.path ?? file?.name ?? file?.filename,
      file?.source ?? file?.code ?? file?.text
    ])
    : Object.entries(files || {});
  for (const [rawPath, rawSource] of entries) {
    const filePath = normalizePackageFilePath(rawPath);
    if (!filePath || seen.has(filePath)) {
      continue;
    }
    seen.add(filePath);
    output.push({
      path: filePath,
      source: String(rawSource ?? '')
    });
  }
  return output.sort((left, right) => left.path.localeCompare(right.path));
}

function normalizePackageFilePath(filePath) {
  let value = String(filePath || '').replace(/\\/g, '/').trim();
  while (value.startsWith('./')) {
    value = value.slice(2);
  }
  value = value.replace(/^\/+/, '');
  const parts = value.split('/').filter(Boolean);
  if (!parts.length || parts.includes('..') || parts.some((part) => part === '.' || part.includes('\0'))) {
    return '';
  }
  return parts.join('/');
}

function normalizePackageJson(packageJson) {
  if (!packageJson) {
    return {};
  }
  if (typeof packageJson === 'string') {
    try {
      const parsed = JSON.parse(packageJson);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? sortJsonObject(parsed) : {};
    } catch {
      return {};
    }
  }
  if (typeof packageJson === 'object' && !Array.isArray(packageJson)) {
    return sortJsonObject(packageJson);
  }
  return {};
}

function sortJsonObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortJsonObject);
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value == null) {
      return value;
    }
    return String(value);
  }
  return Object.keys(value).sort().reduce((output, key) => {
    if (value[key] !== undefined) {
      output[key] = sortJsonObject(value[key]);
    }
    return output;
  }, {});
}

function normalizeDependencyAliases(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.keys(value).sort().reduce((output, key) => {
    const alias = String(key || '').trim();
    const target = String(value[key] || '').trim();
    if (alias && target) {
      output[alias] = target;
    }
    return output;
  }, {});
}

module.exports = {
  collectSandboxPackageReferencesFromCollection,
  collectSandboxPackageReferencesFromText,
  collectSandboxPackageReferencesFromWorkspace,
  sandboxPackageCacheStatus,
  scriptPackageBundleIntegrity,
  scriptPackageIntegrity
};
