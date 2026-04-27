const crypto = require('node:crypto');

const PACKAGE_REF_PATTERN = /\b(?:pm\.)?require\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
const REVIEWED_PACKAGE_SPECIFIER_PATTERN = /^(?:npm:[a-z0-9@._/-]+@\d[\w.+-]*|jsr:[a-z0-9@._/-]+@\d[\w.+-]*|@[a-z0-9._-]+\/[a-z0-9._-]+)$/i;
const EXTERNAL_PACKAGE_PREFIX_PATTERN = /^(?:npm:|jsr:|@)/i;

function collectSandboxPackageReferencesFromCollection(collection = {}) {
  const references = new Map();
  const visitRequest = (request = {}) => {
    for (const source of requestScriptSources(request)) {
      collectSandboxPackageReferencesFromText(source, references);
    }
  };
  const visitFolder = (folder = {}) => {
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
    const expected = scriptPackageIntegrity(cached.source);
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
      dependencies: Array.isArray(item.dependencies) ? item.dependencies.map(String).filter(Boolean) : [],
      integrity: String(item.integrity || '').trim(),
      maxExportKeys: Number.isFinite(Number(item.maxExportKeys)) ? Number(item.maxExportKeys) : undefined,
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

module.exports = {
  collectSandboxPackageReferencesFromCollection,
  collectSandboxPackageReferencesFromText,
  collectSandboxPackageReferencesFromWorkspace,
  sandboxPackageCacheStatus,
  scriptPackageIntegrity
};
