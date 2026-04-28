const crypto = require('node:crypto');
const path = require('node:path');
const { LIMITS } = require('./payloadSchemas');

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
    if (!normalized.source || !normalized.localPath || seen.has(normalized.source)) {
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

function normalizeFileBinding(item = {}) {
  const source = normalizeSource(item.source || item.src);
  const localPath = String(item.localPath || item.path || item.filePath || '').slice(0, LIMITS.value);
  const id = String(item.id || fileBindingIdForSource(source)).slice(0, LIMITS.name);
  return {
    id,
    source,
    localPath,
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
  const normalizedReferences = normalizeImportedFileReferences(references);
  const bindings = normalizeSandboxFileBindings(workspace.settings?.sandbox?.fileBindings || []);
  const bindingBySource = new Map(bindings.filter((item) => item.enabled !== false).map((item) => [item.source, item]));
  return normalizedReferences.map((reference) => {
    const binding = bindingBySource.get(reference.source);
    return {
      ...reference,
      binding: binding || null,
      bound: Boolean(binding?.localPath),
      status: binding?.localPath ? 'Bound' : 'Needs local file binding'
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
  return binding;
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
  for (const request of node.requests || []) {
    collectImportedFileReferencesFromNode(request, references);
  }
  for (const folder of node.folders || []) {
    collectImportedFileReferencesFromNode(folder, references);
  }
}

module.exports = {
  MAX_ATTACHMENT_BYTES,
  collectImportedFileReferencesFromCollection,
  displayFileBindingPath,
  fileBindingIdForSource,
  fileBindingStatusRows,
  normalizeImportedFileReference,
  normalizeImportedFileReferences,
  normalizeSandboxFileBindings,
  resolveFileAttachmentBinding
};
