const crypto = require('node:crypto');

const SAFE_STORAGE_CODEC = 'electron-safe-storage';
const LEGACY_PLAIN_TEXT_CODEC = 'plain-text-fallback';
const PASSPHRASE_CODEC = 'postmeter-passphrase-v1';
const PASSPHRASE_KDF = 'pbkdf2-sha256';
const PASSPHRASE_ITERATIONS = 210_000;
const PASSPHRASE_KEY_BYTES = 32;
const PASSPHRASE_SALT_BYTES = 16;
const PASSPHRASE_IV_BYTES = 12;

class PassphraseRequiredError extends Error {
  constructor(message = 'PostMeter secret passphrase is required.') {
    super(message);
    this.name = 'PassphraseRequiredError';
  }
}

function createElectronSecretCodec(safeStorageApi) {
  if (!safeStorageApi
    || typeof safeStorageApi.isEncryptionAvailable !== 'function'
    || typeof safeStorageApi.encryptString !== 'function'
    || typeof safeStorageApi.decryptString !== 'function') {
    throw new Error('Electron safeStorage API is not available.');
  }

  let passphrase = process.env.POSTMETER_SECRET_PASSPHRASE || '';

  return {
    name: SAFE_STORAGE_CODEC,
    isSafeStorageAvailable() {
      return safeStorageApi.isEncryptionAvailable();
    },
    setPassphrase(nextPassphrase) {
      passphrase = String(nextPassphrase || '');
    },
    clearPassphrase() {
      passphrase = '';
    },
    encrypt(value) {
      if (safeStorageApi.isEncryptionAvailable()) {
        return {
          codec: SAFE_STORAGE_CODEC,
          value: safeStorageApi.encryptString(String(value)).toString('base64')
        };
      }
      return encryptWithPassphrase(value, passphrase);
    },
    decrypt(value, codec) {
      if (codec === LEGACY_PLAIN_TEXT_CODEC) {
        return value;
      }
      if (codec === PASSPHRASE_CODEC) {
        return decryptWithPassphrase(value, passphrase);
      }
      if (codec !== SAFE_STORAGE_CODEC) {
        throw new Error(`Unsupported secret codec: ${codec || 'unknown'}.`);
      }
      if (!safeStorageApi.isEncryptionAvailable()) {
        throw new Error(safeStorageRecoveryMessage('Electron safeStorage is not available.'));
      }
      try {
        return safeStorageApi.decryptString(Buffer.from(value, 'base64'));
      } catch (error) {
        throw new Error(safeStorageRecoveryMessage(error?.message || 'safeStorage decryption failed.'));
      }
    }
  };
}

function safeStorageRecoveryMessage(reason) {
  return [
    `Encrypted workspace secrets could not be decrypted: ${reason}`,
    'The OS keyring, login session, or desktop secret-service configuration may have changed.',
    'PostMeter cannot recover these exact secret values. Restore access to the original keyring/session or use a redacted/exported backup.'
  ].join(' ');
}

function encryptWithPassphrase(value, passphrase) {
  assertPassphrase(passphrase);
  const salt = crypto.randomBytes(PASSPHRASE_SALT_BYTES);
  const iv = crypto.randomBytes(PASSPHRASE_IV_BYTES);
  const key = derivePassphraseKey(passphrase, salt, PASSPHRASE_ITERATIONS);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(value), 'utf8'),
    cipher.final()
  ]);
  const payload = {
    version: 1,
    kdf: PASSPHRASE_KDF,
    iterations: PASSPHRASE_ITERATIONS,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
  return {
    codec: PASSPHRASE_CODEC,
    value: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
  };
}

function decryptWithPassphrase(value, passphrase) {
  assertPassphrase(passphrase);
  let payload;
  try {
    payload = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
  } catch {
    throw new PassphraseRequiredError('Secret value could not be decoded. Enter the fallback passphrase used to protect this workspace.');
  }
  if (!payload || payload.version !== 1 || payload.kdf !== PASSPHRASE_KDF) {
    throw new Error('Unsupported passphrase-protected secret payload.');
  }

  try {
    const salt = Buffer.from(payload.salt, 'base64');
    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const ciphertext = Buffer.from(payload.ciphertext, 'base64');
    const key = derivePassphraseKey(passphrase, salt, Number(payload.iterations));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]).toString('utf8');
  } catch {
    throw new PassphraseRequiredError('Secret value could not be decrypted. Enter the correct fallback passphrase.');
  }
}

function assertPassphrase(passphrase) {
  if (!passphrase || String(passphrase).length < 8) {
    throw new PassphraseRequiredError('Enter a fallback passphrase with at least 8 characters to protect workspace secrets.');
  }
}

function derivePassphraseKey(passphrase, salt, iterations) {
  const count = Number(iterations);
  if (!Number.isSafeInteger(count) || count < 100_000) {
    throw new Error('Unsupported passphrase key-derivation parameters.');
  }
  return crypto.pbkdf2Sync(String(passphrase), salt, count, PASSPHRASE_KEY_BYTES, 'sha256');
}

module.exports = {
  LEGACY_PLAIN_TEXT_CODEC,
  PASSPHRASE_CODEC,
  PassphraseRequiredError,
  SAFE_STORAGE_CODEC,
  createElectronSecretCodec,
  decryptWithPassphrase,
  encryptWithPassphrase,
  safeStorageRecoveryMessage
};
