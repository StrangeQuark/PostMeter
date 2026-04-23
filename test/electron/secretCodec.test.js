const assert = require('node:assert/strict');
const test = require('node:test');
const {
  LEGACY_PLAIN_TEXT_CODEC,
  PASSPHRASE_CODEC,
  PassphraseRequiredError,
  SAFE_STORAGE_CODEC,
  createElectronSecretCodec,
  safeStorageRecoveryMessage
} = require('../../electron/secretCodec');

test('encrypts and decrypts values with Electron safeStorage', () => {
  const safeStorage = fakeSafeStorage(true);
  const codec = createElectronSecretCodec(safeStorage);

  const encrypted = codec.encrypt('secret-value');

  assert.equal(encrypted.codec, SAFE_STORAGE_CODEC);
  assert.notEqual(encrypted.value, 'secret-value');
  assert.equal(codec.decrypt(encrypted.value, encrypted.codec), 'secret-value');
});

test('requires fallback passphrase instead of writing plaintext when safeStorage is unavailable', () => {
  const codec = createElectronSecretCodec(fakeSafeStorage(false));

  assert.throws(
    () => codec.encrypt('secret-value'),
    (error) => error instanceof PassphraseRequiredError && /docs\/SECRETS\.md/.test(error.message)
  );
});

test('encrypts and decrypts values with passphrase fallback when safeStorage is unavailable', () => {
  const codec = createElectronSecretCodec(fakeSafeStorage(false));
  codec.setPassphrase('correct horse battery staple');

  const encrypted = codec.encrypt('secret-value');

  assert.equal(encrypted.codec, PASSPHRASE_CODEC);
  assert.notEqual(encrypted.value, 'secret-value');
  assert.equal(codec.decrypt(encrypted.value, encrypted.codec), 'secret-value');

  codec.setPassphrase('wrong horse battery staple');
  assert.throws(
    () => codec.decrypt(encrypted.value, encrypted.codec),
    (error) => error instanceof PassphraseRequiredError && /docs\/SECRETS\.md/.test(error.message)
  );
});

test('keeps legacy plaintext fallback wrappers readable without writing new ones', () => {
  const codec = createElectronSecretCodec(fakeSafeStorage(false));

  assert.equal(codec.decrypt('legacy-secret', LEGACY_PLAIN_TEXT_CODEC), 'legacy-secret');
});

test('reports safeStorage recovery guidance when host decryption is unavailable', () => {
  const encrypted = createElectronSecretCodec(fakeSafeStorage(true)).encrypt('secret-value');
  const unavailableCodec = createElectronSecretCodec(fakeSafeStorage(false));
  assert.throws(
    () => unavailableCodec.decrypt(encrypted.value, encrypted.codec),
    /original keyring\/session/
  );

  const failingCodec = createElectronSecretCodec({
    ...fakeSafeStorage(true),
    decryptString() {
      throw new Error('keyring changed');
    }
  });
  assert.throws(
    () => failingCodec.decrypt(encrypted.value, encrypted.codec),
    /keyring changed/
  );
  assert.match(safeStorageRecoveryMessage('reason'), /PostMeter cannot recover these exact secret values/);
  assert.match(safeStorageRecoveryMessage('reason'), /docs\/SECRETS\.md/);
});

function fakeSafeStorage(available) {
  return {
    isEncryptionAvailable() {
      return available;
    },
    encryptString(value) {
      return Buffer.from(`cipher:${value}`, 'utf8');
    },
    decryptString(buffer) {
      return buffer.toString('utf8').replace(/^cipher:/, '');
    }
  };
}
