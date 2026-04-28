const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  EncryptedVaultStore,
  MemoryVaultStore,
  VaultUnavailableError
} = require('../../src/core/vaultStore');

test('encrypted vault store persists secrets outside plaintext JSON', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-vault-'));
  const vaultPath = path.join(dir, 'vault.json');
  const store = new EncryptedVaultStore(vaultPath, testCryptoProvider());

  await store.set('apiToken', 'super-secret', { requestId: 'request-1', requestName: 'Request One' });
  assert.equal(await store.get('apiToken'), 'super-secret');
  const metadata = await store.listMetadata();
  assert.equal(metadata.length, 1);
  assert.equal(metadata[0].key, 'apiToken');
  assert.ok(metadata[0].updatedAt);
  const audit = await store.listAudit();
  assert.equal(audit.length, 1);
  assert.equal(audit[0].operation, 'set');
  assert.equal(audit[0].key, 'apiToken');
  assert.equal(audit[0].requestName, 'Request One');

  const raw = await fs.readFile(vaultPath, 'utf8');
  assert.equal(raw.includes('super-secret'), false);
  assert.equal(raw.includes('request-1'), true);

  const reloaded = new EncryptedVaultStore(vaultPath, testCryptoProvider());
  assert.equal(await reloaded.get('apiToken'), 'super-secret');
  await reloaded.unset('apiToken', { requestId: 'request-1' });
  assert.equal(await reloaded.get('apiToken'), undefined);
});

test('encrypted vault store fails closed when encryption is unavailable', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-vault-unavailable-'));
  const store = new EncryptedVaultStore(path.join(dir, 'vault.json'), {
    isAvailable: () => false,
    encryptString: () => Buffer.from(''),
    decryptString: () => ''
  });

  assert.equal(store.isAvailable(), false);
  await assert.rejects(() => store.set('token', 'secret'), VaultUnavailableError);
  await assert.rejects(() => store.get('token'), VaultUnavailableError);
});

test('memory vault store normalizes keys and values for broker tests', async () => {
  const store = new MemoryVaultStore();
  await store.set(' token ', 123);

  assert.equal(await store.get('token'), '123');
  await store.unset('token');
  assert.equal(await store.get('token'), undefined);
});

function testCryptoProvider() {
  return {
    isAvailable: () => true,
    encryptString(value) {
      return Buffer.from(`sealed:${Buffer.from(String(value), 'utf8').toString('base64')}`, 'utf8');
    },
    decryptString(value) {
      const text = Buffer.from(value).toString('utf8');
      if (!text.startsWith('sealed:')) {
        throw new Error('Bad test ciphertext.');
      }
      return Buffer.from(text.slice('sealed:'.length), 'base64').toString('utf8');
    }
  };
}
