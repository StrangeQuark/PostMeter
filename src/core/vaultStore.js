const fs = require('node:fs/promises');
const path = require('node:path');

const VAULT_SCHEMA_VERSION = 1;
const MAX_VAULT_KEY_BYTES = 256;
const MAX_VAULT_SECRET_BYTES = 64 * 1024;
const MAX_VAULT_SECRETS = 1000;
const MAX_VAULT_AUDIT_ENTRIES = 200;

class VaultUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VaultUnavailableError';
  }
}

class MemoryVaultStore {
  constructor(initialSecrets = {}) {
    this.secrets = new Map();
    this.auditEntries = [];
    for (const [key, value] of Object.entries(initialSecrets || {})) {
      this.secrets.set(normalizeVaultKey(key), normalizeVaultSecretValue(value));
    }
  }

  isAvailable() {
    return true;
  }

  async get(key) {
    return this.secrets.get(normalizeVaultKey(key));
  }

  async set(key, value) {
    if (this.secrets.size >= MAX_VAULT_SECRETS && !this.secrets.has(normalizeVaultKey(key))) {
      throw new Error(`PostMeter vault cannot store more than ${MAX_VAULT_SECRETS} secrets.`);
    }
    this.secrets.set(normalizeVaultKey(key), normalizeVaultSecretValue(value));
  }

  async unset(key) {
    this.secrets.delete(normalizeVaultKey(key));
  }

  async audit(operation, key, metadata = {}) {
    const document = { audit: this.auditEntries };
    appendAuditEntry(document, operation, normalizeVaultKey(key), metadata);
    this.auditEntries = document.audit.slice(-MAX_VAULT_AUDIT_ENTRIES);
  }

  async listMetadata() {
    return [...this.secrets.keys()].sort().map((key) => ({ key }));
  }

  async listAudit() {
    return this.auditEntries.map((entry) => ({ ...entry }));
  }
}

class EncryptedVaultStore {
  constructor(vaultPath, cryptoProvider, options = {}) {
    this.vaultPath = path.resolve(vaultPath);
    this.cryptoProvider = cryptoProvider;
    this.maxSecrets = Number.isFinite(Number(options.maxSecrets))
      ? Math.max(1, Math.min(MAX_VAULT_SECRETS, Number(options.maxSecrets)))
      : MAX_VAULT_SECRETS;
    this.queue = Promise.resolve();
  }

  isAvailable() {
    return typeof this.cryptoProvider?.encryptString === 'function'
      && typeof this.cryptoProvider?.decryptString === 'function'
      && this.cryptoProvider.isAvailable?.() !== false;
  }

  async get(key) {
    this.assertAvailable();
    const normalizedKey = normalizeVaultKey(key);
    const document = await this.load();
    const entry = document.secrets[normalizedKey];
    if (!entry?.ciphertext) {
      return undefined;
    }
    return this.decrypt(entry.ciphertext);
  }

  async set(key, value, metadata = {}) {
    this.assertAvailable();
    const normalizedKey = normalizeVaultKey(key);
    const normalizedValue = normalizeVaultSecretValue(value);
    await this.mutate(async (document) => {
      if (!document.secrets[normalizedKey] && Object.keys(document.secrets).length >= this.maxSecrets) {
        throw new Error(`PostMeter vault cannot store more than ${this.maxSecrets} secrets.`);
      }
      document.secrets[normalizedKey] = {
        ciphertext: this.encrypt(normalizedValue),
        updatedAt: new Date().toISOString()
      };
      appendAuditEntry(document, 'set', normalizedKey, metadata);
      return document;
    });
  }

  async unset(key, metadata = {}) {
    this.assertAvailable();
    const normalizedKey = normalizeVaultKey(key);
    await this.mutate(async (document) => {
      delete document.secrets[normalizedKey];
      appendAuditEntry(document, 'unset', normalizedKey, metadata);
      return document;
    });
  }

  async audit(operation, key, metadata = {}) {
    this.assertAvailable();
    const normalizedKey = normalizeVaultKey(key);
    await this.mutate(async (document) => {
      appendAuditEntry(document, operation, normalizedKey, metadata);
      return document;
    });
  }

  async listMetadata() {
    this.assertAvailable();
    const document = await this.load();
    return Object.entries(document.secrets)
      .map(([key, entry]) => ({ key, updatedAt: entry.updatedAt || '' }))
      .sort((left, right) => left.key.localeCompare(right.key));
  }

  async listAudit() {
    this.assertAvailable();
    const document = await this.load();
    return (document.audit || []).slice(-MAX_VAULT_AUDIT_ENTRIES).map((entry) => ({ ...entry }));
  }

  assertAvailable() {
    if (!this.isAvailable()) {
      throw new VaultUnavailableError('PostMeter vault encryption is unavailable on this machine.');
    }
  }

  encrypt(value) {
    const encrypted = this.cryptoProvider.encryptString(value);
    return Buffer.from(encrypted).toString('base64');
  }

  decrypt(value) {
    return this.cryptoProvider.decryptString(Buffer.from(String(value || ''), 'base64'));
  }

  async mutate(mutator) {
    const run = this.queue
      .catch(() => {})
      .then(async () => {
        const nextDocument = await mutator(await this.load());
        await this.save(nextDocument);
        return nextDocument;
      });
    this.queue = run.catch(() => {});
    return run;
  }

  async load() {
    try {
      const parsed = JSON.parse(await fs.readFile(this.vaultPath, 'utf8'));
      return normalizeVaultDocument(parsed);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return emptyVaultDocument();
      }
      throw new Error(`PostMeter vault could not be read: ${error.message || String(error)}`);
    }
  }

  async save(document) {
    const normalized = normalizeVaultDocument(document);
    await fs.mkdir(path.dirname(this.vaultPath), { recursive: true, mode: 0o700 });
    const tempPath = path.join(path.dirname(this.vaultPath), `postmeter-vault-${process.pid}-${Date.now()}.tmp`);
    await fs.writeFile(tempPath, JSON.stringify(normalized, null, 2), { mode: 0o600 });
    await fs.chmod(tempPath, 0o600).catch(() => {});
    await fs.rename(tempPath, this.vaultPath);
    await fs.chmod(this.vaultPath, 0o600).catch(() => {});
  }
}

function normalizeVaultKey(key) {
  const normalized = String(key == null ? '' : key).trim();
  if (!normalized) {
    throw new Error('pm.vault secret key is required.');
  }
  if (Buffer.byteLength(normalized, 'utf8') > MAX_VAULT_KEY_BYTES) {
    throw new Error(`pm.vault secret key cannot exceed ${MAX_VAULT_KEY_BYTES} bytes.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error('pm.vault secret key cannot contain control characters.');
  }
  return normalized;
}

function normalizeVaultSecretValue(value) {
  const normalized = value == null ? '' : String(value);
  if (Buffer.byteLength(normalized, 'utf8') > MAX_VAULT_SECRET_BYTES) {
    throw new Error(`pm.vault secret value cannot exceed ${MAX_VAULT_SECRET_BYTES} bytes.`);
  }
  return normalized;
}

function normalizeVaultDocument(document) {
  const normalized = emptyVaultDocument();
  if (!document || typeof document !== 'object') {
    return normalized;
  }
  normalized.schemaVersion = VAULT_SCHEMA_VERSION;
  normalized.createdAt = typeof document.createdAt === 'string' && document.createdAt ? document.createdAt : normalized.createdAt;
  normalized.updatedAt = typeof document.updatedAt === 'string' && document.updatedAt ? document.updatedAt : normalized.updatedAt;
  if (document.secrets && typeof document.secrets === 'object' && !Array.isArray(document.secrets)) {
    for (const [key, entry] of Object.entries(document.secrets).slice(0, MAX_VAULT_SECRETS)) {
      if (!entry || typeof entry !== 'object' || typeof entry.ciphertext !== 'string') {
        continue;
      }
      normalized.secrets[normalizeVaultKey(key)] = {
        ciphertext: entry.ciphertext,
        updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : ''
      };
    }
  }
  if (Array.isArray(document.audit)) {
    normalized.audit = document.audit
      .slice(-MAX_VAULT_AUDIT_ENTRIES)
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({
        at: typeof entry.at === 'string' ? entry.at : '',
        operation: typeof entry.operation === 'string' ? entry.operation : '',
        key: typeof entry.key === 'string' ? entry.key : '',
        requestId: typeof entry.requestId === 'string' ? entry.requestId : '',
        requestName: typeof entry.requestName === 'string' ? entry.requestName : ''
      }));
  }
  return normalized;
}

function emptyVaultDocument() {
  const now = new Date().toISOString();
  return {
    schemaVersion: VAULT_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    secrets: {},
    audit: []
  };
}

function appendAuditEntry(document, operation, key, metadata = {}) {
  document.updatedAt = new Date().toISOString();
  document.audit = [
    ...(document.audit || []),
    {
      at: document.updatedAt,
      operation,
      key,
      requestId: String(metadata.requestId || '').slice(0, MAX_VAULT_KEY_BYTES),
      requestName: String(metadata.requestName || '').slice(0, MAX_VAULT_KEY_BYTES)
    }
  ].slice(-MAX_VAULT_AUDIT_ENTRIES);
}

module.exports = {
  EncryptedVaultStore,
  MemoryVaultStore,
  VaultUnavailableError,
  normalizeVaultKey,
  normalizeVaultSecretValue
};
