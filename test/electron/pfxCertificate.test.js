const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const forge = require('node-forge');
const {
  decryptPemPrivateKey,
  extractPfxToPem,
  readRegularFileBounded
} = require('../../src/core/http/pfxCertificate');

test('PFX certificate loader rejects missing, non-regular, oversized, and malformed bundles clearly', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-pfx-direct-'));
  t.after(async () => fs.rm(tempDir, { recursive: true, force: true }));
  const malformedPath = path.join(tempDir, 'malformed.p12');
  const oversizedPath = path.join(tempDir, 'oversized.p12');
  await fs.writeFile(malformedPath, Buffer.from('not a pfx'));
  await fs.writeFile(oversizedPath, Buffer.alloc(9));

  await assert.rejects(
    () => readRegularFileBounded(path.join(tempDir, 'missing.p12'), 'PFX fixture', 8),
    /Unable to read PFX fixture/
  );
  await assert.rejects(
    () => readRegularFileBounded(tempDir, 'PFX fixture', 8),
    /must be a regular file/
  );
  await assert.rejects(
    () => readRegularFileBounded(oversizedPath, 'PFX fixture', 8),
    /cannot exceed 8 bytes/
  );
  await assert.rejects(
    () => extractPfxToPem(malformedPath, '', { bundleLabel: 'test PFX fixture' }),
    /test PFX fixture could not be extracted/
  );
});

test('PEM private-key decryptor handles plaintext, missing passphrase, wrong passphrase, and valid passphrase', () => {
  const keyPair = forge.pki.rsa.generateKeyPair({ bits: 512, e: 0x10001 });
  const plaintextPem = forge.pki.privateKeyToPem(keyPair.privateKey);
  const encryptedPem = forge.pki.encryptRsaPrivateKey(keyPair.privateKey, 'correct-passphrase', {
    algorithm: 'aes256'
  });

  assert.equal(decryptPemPrivateKey(plaintextPem).toString('utf8'), plaintextPem);
  assert.throws(
    () => decryptPemPrivateKey(encryptedPem, '', 'Client key'),
    /Client key is encrypted and requires a passphrase/
  );
  assert.throws(
    () => decryptPemPrivateKey(encryptedPem, 'wrong-passphrase', 'Client key'),
    /Client key could not be decrypted/
  );
  assert.match(
    decryptPemPrivateKey(encryptedPem, 'correct-passphrase', 'Client key').toString('utf8'),
    /BEGIN RSA PRIVATE KEY/
  );
});
