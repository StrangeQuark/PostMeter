const crypto = require('node:crypto');
const path = require('node:path');

const DEFAULT_TOKEN_BYTES = 32;
const DEFAULT_TTL_MILLIS = 10 * 60 * 1000;

function createFileCapabilityStore(options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const ttlMillis = Number.isFinite(Number(options.ttlMillis)) && Number(options.ttlMillis) > 0
    ? Number(options.ttlMillis)
    : DEFAULT_TTL_MILLIS;
  const entries = new Map();

  function issue(input = {}) {
    const operation = assertOperation(input.operation);
    const absolutePath = assertAbsolutePath(input.path);
    const issuedAt = Math.max(0, Number(input.issuedAt) || now());
    const expiresAt = Math.max(issuedAt + 1, Number(input.expiresAt) || issuedAt + ttlMillis);
    const token = crypto.randomBytes(DEFAULT_TOKEN_BYTES).toString('base64url');
    const entry = {
      token,
      path: absolutePath,
      operation,
      workspaceId: normalizeWorkspaceId(input.workspaceId),
      issuedAt,
      expiresAt,
      oneTime: input.oneTime !== false,
      contentKinds: normalizeList(input.contentKinds),
      extensions: normalizeExtensions(input.extensions)
    };
    entries.set(token, entry);
    return publicCapability(entry);
  }

  function consume(tokenValue, constraints = {}) {
    const token = String(tokenValue || '').trim();
    if (!token) {
      throw capabilityError('File capability token is required.');
    }
    const entry = entries.get(token);
    if (!entry) {
      throw capabilityError('File capability token is invalid or has already been used.');
    }
    const currentTime = now();
    if (entry.expiresAt <= currentTime) {
      entries.delete(token);
      throw capabilityError('File capability token has expired.');
    }
    const expectedOperation = constraints.operation ? assertOperation(constraints.operation) : '';
    if (expectedOperation && entry.operation !== expectedOperation) {
      throw capabilityError('File capability token is not valid for this operation.');
    }
    const expectedWorkspaceId = normalizeWorkspaceId(constraints.workspaceId);
    const entryWorkspaceId = normalizeWorkspaceId(entry.workspaceId);
    if (expectedWorkspaceId && entryWorkspaceId !== expectedWorkspaceId) {
      throw capabilityError('File capability token is not valid for this workspace.');
    }
    if (constraints.extension && entry.extensions.length) {
      const extension = normalizeExtension(constraints.extension);
      if (!entry.extensions.includes(extension)) {
        throw capabilityError('File capability token is not valid for this file type.');
      }
    }
    if (constraints.contentKind && entry.contentKinds.length) {
      const contentKind = String(constraints.contentKind || '').trim().toLowerCase();
      if (!entry.contentKinds.includes(contentKind)) {
        throw capabilityError('File capability token is not valid for this content kind.');
      }
    }
    if (entry.oneTime) {
      entries.delete(token);
    }
    return { ...entry };
  }

  function peek(tokenValue) {
    const entry = entries.get(String(tokenValue || '').trim());
    return entry ? { ...entry } : null;
  }

  function pruneExpired() {
    const currentTime = now();
    for (const [token, entry] of entries.entries()) {
      if (entry.expiresAt <= currentTime) {
        entries.delete(token);
      }
    }
  }

  return {
    consume,
    issue,
    peek,
    pruneExpired,
    size: () => entries.size
  };
}

function publicCapability(entry) {
  return {
    token: entry.token,
    operation: entry.operation,
    workspaceId: entry.workspaceId,
    issuedAt: entry.issuedAt,
    expiresAt: entry.expiresAt,
    oneTime: entry.oneTime,
    fileName: path.basename(entry.path),
    displayPath: path.basename(entry.path)
  };
}

function assertOperation(value) {
  const operation = String(value || '').trim();
  if (!/^[a-z][a-z0-9-]{1,63}$/u.test(operation)) {
    throw new Error('File capability operation is invalid.');
  }
  return operation;
}

function assertAbsolutePath(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('File capability path must be a non-empty string.');
  }
  if (value.includes('\0')) {
    throw new Error('File capability path must not contain null bytes.');
  }
  const resolved = path.resolve(value);
  if (!path.isAbsolute(resolved)) {
    throw new Error('File capability path must resolve to an absolute path.');
  }
  return resolved;
}

function normalizeWorkspaceId(value) {
  return String(value || '').trim().slice(0, 256);
}

function normalizeList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))].slice(0, 16);
}

function normalizeExtensions(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map(normalizeExtension).filter(Boolean))].slice(0, 32);
}

function normalizeExtension(value) {
  const extension = String(value || '').trim().toLowerCase().replace(/^\./u, '');
  return /^[a-z0-9][a-z0-9+-]{0,31}$/u.test(extension) ? extension : '';
}

function capabilityError(message) {
  const error = new Error(message);
  error.code = 'POSTMETER_FILE_CAPABILITY_DENIED';
  return error;
}

const defaultFileCapabilityStore = createFileCapabilityStore();

module.exports = {
  createFileCapabilityStore,
  defaultFileCapabilityStore
};
