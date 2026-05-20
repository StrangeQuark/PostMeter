const crypto = require('node:crypto');

const ENCRYPTED_WORKSPACE_FORMAT = 'postmeter.encrypted-workspace';
const ENCRYPTED_WORKSPACE_VERSION = 1;
const WORKSPACE_KEY_MIN_LENGTH = 6;
const KDF_PARAMS = Object.freeze({
  name: 'scrypt',
  N: 32768,
  r: 8,
  p: 1,
  keyLength: 32,
  maxmem: 64 * 1024 * 1024
});
const CIPHER_NAME = 'aes-256-gcm';
const SALT_BYTES = 32;
const IV_BYTES = 12;

class WorkspaceEncryptionError extends Error {
  constructor(message, code = 'WORKSPACE_ENCRYPTION_ERROR', cause = null) {
    super(message);
    this.name = 'WorkspaceEncryptionError';
    this.code = code;
    this.cause = cause;
  }
}

class WorkspaceEncryptionKeyRequiredError extends WorkspaceEncryptionError {
  constructor(message = 'Workspace encryption key is required.') {
    super(message, 'WORKSPACE_ENCRYPTION_KEY_REQUIRED');
    this.name = 'WorkspaceEncryptionKeyRequiredError';
  }
}

class WorkspaceUnlockFailedError extends WorkspaceEncryptionError {
  constructor(message = 'Workspace could not be decrypted. Check the key and try again.', cause = null) {
    super(message, 'WORKSPACE_UNLOCK_FAILED', cause);
    this.name = 'WorkspaceUnlockFailedError';
  }
}

function assertWorkspaceEncryptionKey(key, field = 'encryption key') {
  if (typeof key !== 'string') {
    throw new WorkspaceEncryptionKeyRequiredError(`${field} must be a string.`);
  }
  if (key.length < WORKSPACE_KEY_MIN_LENGTH) {
    throw new WorkspaceEncryptionKeyRequiredError(`${field} must be at least ${WORKSPACE_KEY_MIN_LENGTH} characters.`);
  }
  return key;
}

function isEncryptedWorkspaceEnvelope(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && value.format === ENCRYPTED_WORKSPACE_FORMAT
    && Number(value.version) === ENCRYPTED_WORKSPACE_VERSION
    && value.kdf
    && typeof value.kdf === 'object'
    && value.cipher
    && typeof value.cipher === 'object'
    && typeof value.ciphertext === 'string'
  );
}

async function encryptWorkspacePayload(payload, key) {
  assertWorkspaceEncryptionKey(key);
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const derivedKey = await deriveKey(key, salt, KDF_PARAMS);
  return encryptPayloadWithDerivedKey(payload, derivedKey, salt, iv);
}

function encryptWorkspacePayloadSync(payload, key) {
  assertWorkspaceEncryptionKey(key);
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const derivedKey = deriveKeySync(key, salt, KDF_PARAMS);
  return encryptPayloadWithDerivedKey(payload, derivedKey, salt, iv);
}

async function decryptWorkspaceEnvelope(envelope, key) {
  assertEncryptedWorkspaceEnvelope(envelope);
  assertWorkspaceEncryptionKey(key);
  const salt = base64Buffer(envelope.kdf.salt, 'workspace salt');
  const derivedKey = await deriveKey(key, salt, normalizeKdfParams(envelope.kdf));
  return decryptEnvelopeWithDerivedKey(envelope, derivedKey);
}

function decryptWorkspaceEnvelopeSync(envelope, key) {
  assertEncryptedWorkspaceEnvelope(envelope);
  assertWorkspaceEncryptionKey(key);
  const salt = base64Buffer(envelope.kdf.salt, 'workspace salt');
  const derivedKey = deriveKeySync(key, salt, normalizeKdfParams(envelope.kdf));
  return decryptEnvelopeWithDerivedKey(envelope, derivedKey);
}

function encryptPayloadWithDerivedKey(payload, derivedKey, salt, iv) {
  const envelope = {
    format: ENCRYPTED_WORKSPACE_FORMAT,
    version: ENCRYPTED_WORKSPACE_VERSION,
    kdf: {
      ...KDF_PARAMS,
      salt: salt.toString('base64')
    },
    cipher: {
      name: CIPHER_NAME,
      iv: iv.toString('base64')
    },
    ciphertext: ''
  };
  const cipher = crypto.createCipheriv(CIPHER_NAME, derivedKey, iv);
  cipher.setAAD(envelopeAssociatedData(envelope));
  const plaintext = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  envelope.cipher.tag = cipher.getAuthTag().toString('base64');
  envelope.ciphertext = ciphertext.toString('base64');
  return envelope;
}

function decryptEnvelopeWithDerivedKey(envelope, derivedKey) {
  try {
    const iv = base64Buffer(envelope.cipher.iv, 'workspace IV');
    const tag = base64Buffer(envelope.cipher.tag, 'workspace authentication tag');
    const ciphertext = base64Buffer(envelope.ciphertext, 'workspace ciphertext');
    const decipher = crypto.createDecipheriv(CIPHER_NAME, derivedKey, iv);
    decipher.setAAD(envelopeAssociatedData(envelope));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return JSON.parse(plaintext);
  } catch (error) {
    throw new WorkspaceUnlockFailedError(undefined, error);
  }
}

function assertEncryptedWorkspaceEnvelope(envelope) {
  if (!isEncryptedWorkspaceEnvelope(envelope)) {
    throw new WorkspaceEncryptionError('Workspace file is not a valid encrypted workspace.', 'WORKSPACE_ENCRYPTION_FORMAT');
  }
  normalizeKdfParams(envelope.kdf);
  if (envelope.cipher.name !== CIPHER_NAME) {
    throw new WorkspaceEncryptionError(`Unsupported workspace cipher "${envelope.cipher.name}".`, 'WORKSPACE_ENCRYPTION_FORMAT');
  }
  base64Buffer(envelope.cipher.iv, 'workspace IV');
  base64Buffer(envelope.cipher.tag, 'workspace authentication tag');
  base64Buffer(envelope.ciphertext, 'workspace ciphertext');
}

function normalizeKdfParams(kdf = {}) {
  if (kdf.name !== KDF_PARAMS.name) {
    throw new WorkspaceEncryptionError(`Unsupported workspace key derivation "${kdf.name}".`, 'WORKSPACE_ENCRYPTION_FORMAT');
  }
  const params = {
    name: KDF_PARAMS.name,
    N: positiveInteger(kdf.N, KDF_PARAMS.N, 'workspace scrypt N'),
    r: positiveInteger(kdf.r, KDF_PARAMS.r, 'workspace scrypt r'),
    p: positiveInteger(kdf.p, KDF_PARAMS.p, 'workspace scrypt p'),
    keyLength: positiveInteger(kdf.keyLength, KDF_PARAMS.keyLength, 'workspace key length'),
    salt: String(kdf.salt || '')
  };
  if (params.keyLength !== KDF_PARAMS.keyLength) {
    throw new WorkspaceEncryptionError('Unsupported workspace key length.', 'WORKSPACE_ENCRYPTION_FORMAT');
  }
  base64Buffer(params.salt, 'workspace salt');
  return params;
}

function positiveInteger(value, fallback, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    if (fallback == null) {
      throw new WorkspaceEncryptionError(`${field} must be a positive integer.`, 'WORKSPACE_ENCRYPTION_FORMAT');
    }
    return fallback;
  }
  return number;
}

function deriveKey(key, salt, params) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(key), salt, params.keyLength, {
      N: params.N,
      r: params.r,
      p: params.p,
      maxmem: KDF_PARAMS.maxmem
    }, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

function deriveKeySync(key, salt, params) {
  return crypto.scryptSync(String(key), salt, params.keyLength, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: KDF_PARAMS.maxmem
  });
}

function base64Buffer(value, field) {
  if (typeof value !== 'string' || !value) {
    throw new WorkspaceEncryptionError(`${field} must be a base64 string.`, 'WORKSPACE_ENCRYPTION_FORMAT');
  }
  const buffer = Buffer.from(value, 'base64');
  if (!buffer.length || buffer.toString('base64').replace(/=+$/g, '') !== value.replace(/=+$/g, '')) {
    throw new WorkspaceEncryptionError(`${field} must be a valid base64 string.`, 'WORKSPACE_ENCRYPTION_FORMAT');
  }
  return buffer;
}

function envelopeAssociatedData(envelope) {
  return Buffer.from(JSON.stringify({
    format: envelope.format,
    version: ENCRYPTED_WORKSPACE_VERSION,
    kdf: {
      name: KDF_PARAMS.name,
      N: Number(envelope.kdf?.N),
      r: Number(envelope.kdf?.r),
      p: Number(envelope.kdf?.p),
      keyLength: Number(envelope.kdf?.keyLength),
      salt: String(envelope.kdf?.salt || '')
    },
    cipher: {
      name: CIPHER_NAME,
      iv: String(envelope.cipher?.iv || '')
    }
  }), 'utf8');
}

module.exports = {
  ENCRYPTED_WORKSPACE_FORMAT,
  ENCRYPTED_WORKSPACE_VERSION,
  WORKSPACE_KEY_MIN_LENGTH,
  WorkspaceEncryptionError,
  WorkspaceEncryptionKeyRequiredError,
  WorkspaceUnlockFailedError,
  assertWorkspaceEncryptionKey,
  decryptWorkspaceEnvelope,
  decryptWorkspaceEnvelopeSync,
  encryptWorkspacePayload,
  encryptWorkspacePayloadSync,
  isEncryptedWorkspaceEnvelope
};
