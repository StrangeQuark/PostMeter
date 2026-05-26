const crypto = require('node:crypto');
const path = require('node:path');
const { LIMITS } = require('../contracts/payloadSchemas');

const MAX_FILE_BINDINGS = 1000;
const MAX_FILE_REFERENCES = 2000;
const MAX_ATTACHMENT_BYTES = LIMITS.body;
const FILE_REFERENCE_MODES = new Set(['file', 'binary', 'formdata']);

function fileBindingIdForSource(source) {
  const normalized = normalizeSource(source);
  const digest = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 24);
  return `file-binding-${digest}`;
}

function normalizeSandboxFileBindings(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set();
  const output = [];
  for (const item of value) {
    const normalized = normalizeFileBinding(item);
    if (!normalized.source || seen.has(normalized.source)) {
      continue;
    }
    seen.add(normalized.source);
    output.push(normalized);
    if (output.length >= MAX_FILE_BINDINGS) {
      break;
    }
  }
  return output;
}

function mainOwnedFileBindingsForWorkspace(workspace = {}) {
  return normalizeSandboxFileBindings([
    ...(workspace.localsettings?.sandbox?.fileBindings || []),
    ...certificatePathBindingsFromWorkspace(workspace)
  ]);
}

function certificatePathBindingsFromWorkspace(workspace = {}) {
  const bindings = [];
  collectCertificatePathBindings(workspace.localsettings?.request, bindings);
  return bindings;
}

function collectCertificatePathBindings(requestSettings = {}, bindings = []) {
  if (!requestSettings || typeof requestSettings !== 'object') {
    return;
  }
  addCertificatePathBinding(requestSettings.caCertificatePath, 'caCertificatePath', bindings);
  for (const certificate of Array.isArray(requestSettings.clientCertificates) ? requestSettings.clientCertificates : []) {
    addCertificatePathBinding(certificate?.caPath, 'caPath', bindings);
    addCertificatePathBinding(certificate?.certPath, 'certPath', bindings);
    addCertificatePathBinding(certificate?.keyPath, 'keyPath', bindings);
    addCertificatePathBinding(certificate?.pfxPath, 'pfxPath', bindings);
  }
}

function addCertificatePathBinding(value, key, bindings) {
  const localPath = String(value || '').trim();
  if (!localPath || localPath.startsWith('postmeter-local-file/')) {
    return;
  }
  if (!path.isAbsolute(localPath)) {
    return;
  }
  const resolved = path.resolve(localPath);
  bindings.push({
    source: localPath,
    localPath: resolved,
    mode: 'file',
    key,
    fileName: path.basename(resolved),
    reviewedAt: ''
  });
}

function normalizeFileBinding(item = {}) {
  const source = normalizeSource(item.source || item.src);
  const localPath = String(item.localPath || item.path || item.filePath || '').slice(0, LIMITS.value);
  const id = String(item.id || fileBindingIdForSource(source)).slice(0, LIMITS.name);
  return {
    id,
    source,
    localPath,
    bound: item.bound === true || Boolean(localPath),
    mode: normalizeFileReferenceMode(item.mode),
    key: item.key == null ? '' : String(item.key).slice(0, LIMITS.key),
    contentType: item.contentType == null ? '' : String(item.contentType).slice(0, LIMITS.value),
    fileName: item.fileName == null ? '' : String(item.fileName).slice(0, LIMITS.name),
    enabled: item.enabled !== false,
    reviewedAt: item.reviewedAt == null ? '' : String(item.reviewedAt).slice(0, LIMITS.name)
  };
}

function normalizeImportedFileReferences(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set();
  const output = [];
  for (const item of value) {
    const normalized = normalizeImportedFileReference(item);
    if (!normalized.source) {
      continue;
    }
    const key = `${normalized.mode}|${normalized.key}|${normalized.source}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(normalized);
    if (output.length >= MAX_FILE_REFERENCES) {
      break;
    }
  }
  return output;
}

function normalizeImportedFileReference(item = {}) {
  const source = normalizeSource(item.source || item.src);
  return {
    id: String(item.id || fileBindingIdForSource(source)).slice(0, LIMITS.name),
    mode: normalizeFileReferenceMode(item.mode),
    key: item.key == null ? '' : String(item.key).slice(0, LIMITS.key),
    source,
    contentType: item.contentType == null ? '' : String(item.contentType).slice(0, LIMITS.value),
    fileName: item.fileName == null ? '' : String(item.fileName).slice(0, LIMITS.name)
  };
}

function collectImportedFileReferencesFromCollection(collection = {}) {
  const references = [];
  collectImportedFileReferencesFromNode(collection, references);
  return normalizeImportedFileReferences(references);
}

function fileBindingStatusRows(workspace = {}) {
  const references = [];
  for (const collection of workspace.collections || []) {
    references.push(...collectImportedFileReferencesFromCollection(collection));
  }
  for (const runner of workspace.runners || []) {
    collectImportedFileReferencesFromNode(runner, references);
  }
  for (const test of workspace.performanceTests || []) {
    collectImportedFileReferencesFromNode(test?.request, references);
  }
  const normalizedReferences = normalizeImportedFileReferences(references);
  const mainBindingsBySource = new Map(mainOwnedFileBindingsForWorkspace(workspace)
    .filter((item) => item.enabled !== false)
    .map((item) => [item.source, item]));
  const bindings = normalizeSandboxFileBindings(workspace.settings?.sandbox?.fileBindings || []);
  const bindingBySource = new Map(bindings.filter((item) => item.enabled !== false).map((item) => {
    const main = mainBindingsBySource.get(item.source);
    return [item.source, {
      ...item,
      localPath: main?.localPath || '',
      bound: Boolean(main?.localPath) || item.bound === true
    }];
  }));
  return normalizedReferences.map((reference) => {
    const binding = bindingBySource.get(reference.source);
    return {
      ...reference,
      binding: binding || null,
      bound: binding?.bound === true || Boolean(binding?.localPath),
      status: binding?.bound === true || binding?.localPath ? 'Bound' : 'Needs local file binding'
    };
  });
}

function resolveFileAttachmentBinding(reference, fileBindings = []) {
  const source = normalizeSource(reference?.source || reference?.src);
  const bindingId = String(reference?.bindingId || reference?.id || '').trim();
  const bindings = normalizeSandboxFileBindings(fileBindings);
  const binding = bindings.find((candidate) => (
    candidate.enabled !== false
    && (source ? candidate.source === source : bindingId && candidate.id === bindingId)
  ));
  if (!binding) {
    throw new Error(`File attachment binding is required for ${source || bindingId || 'request body'}; scripts cannot read arbitrary local files.`);
  }
  if (!binding.localPath) {
    throw new Error(`File attachment binding is required for ${source || bindingId || 'request body'}; scripts cannot read arbitrary local files.`);
  }
  return binding;
}

function sanitizeSandboxFileBindingsForRenderer(value = []) {
  return normalizeSandboxFileBindings(value).map((binding) => ({
    id: binding.id,
    source: binding.source,
    mode: binding.mode,
    key: binding.key,
    contentType: binding.contentType,
    fileName: binding.fileName,
    enabled: binding.enabled,
    reviewedAt: binding.reviewedAt,
    bound: binding.bound === true || Boolean(binding.localPath)
  }));
}

function mergeRendererFileBindingMetadataWithMainPaths(rendererBindings = [], mainBindings = []) {
  const mainBySource = new Map(normalizeSandboxFileBindings(mainBindings).map((binding) => [binding.source, binding]));
  return normalizeSandboxFileBindings(rendererBindings).map((binding) => {
    const main = mainBySource.get(binding.source);
    return {
      ...binding,
      localPath: main?.localPath || '',
      bound: Boolean(main?.localPath) || binding.bound === true
    };
  });
}

function normalizeSource(value) {
  return String(value || '').trim().slice(0, LIMITS.value);
}

function normalizeFileReferenceMode(value) {
  const mode = String(value || 'file').trim().toLowerCase();
  return FILE_REFERENCE_MODES.has(mode) ? mode : 'file';
}

function displayFileBindingPath(value) {
  const text = String(value || '');
  return text ? path.basename(text) || text : '';
}

function collectImportedFileReferencesFromNode(node, references) {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node.postman?.fileReferences)) {
    references.push(...node.postman.fileReferences);
  }
  references.push(...fileReferencesFromPostmanBody(node.postmanBody));
  for (const request of node.requests || []) {
    collectImportedFileReferencesFromNode(request, references);
  }
  for (const folder of node.folders || []) {
    collectImportedFileReferencesFromNode(folder, references);
  }
}

function fileReferencesFromPostmanBody(postmanBody) {
  const mode = String(postmanBody?.mode || '').toLowerCase();
  if (mode === 'binary' || mode === 'file') {
    const body = mode === 'file' ? postmanBody.file : postmanBody.binary;
    const source = normalizeSource(body?.src);
    return source ? [{
      contentType: body?.contentType == null ? '' : String(body.contentType).slice(0, LIMITS.value),
      key: '',
      mode: 'binary',
      source
    }] : [];
  }
  if (mode !== 'formdata' && mode !== 'form-data') {
    return [];
  }
  const references = [];
  for (const part of Array.isArray(postmanBody.formdata) ? postmanBody.formdata : []) {
    if (!part || typeof part !== 'object' || part.disabled === true || part.enabled === false) {
      continue;
    }
    if (part.src == null && String(part.type || '').toLowerCase() !== 'file') {
      continue;
    }
    const sources = Array.isArray(part.src) ? part.src : [part.src];
    for (const source of sources) {
      const normalized = normalizeSource(source);
      if (!normalized) {
        continue;
      }
      references.push({
        contentType: '',
        key: part.key == null ? '' : String(part.key).slice(0, LIMITS.key),
        mode: 'formdata',
        source: normalized
      });
    }
  }
  return references;
}

module.exports = {
  MAX_ATTACHMENT_BYTES,
  collectImportedFileReferencesFromCollection,
  displayFileBindingPath,
  fileBindingIdForSource,
  fileBindingStatusRows,
  mainOwnedFileBindingsForWorkspace,
  mergeRendererFileBindingMetadataWithMainPaths,
  normalizeImportedFileReference,
  normalizeImportedFileReferences,
  normalizeSandboxFileBindings,
  resolveFileAttachmentBinding,
  sanitizeSandboxFileBindingsForRenderer
};
