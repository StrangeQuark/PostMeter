const fs = require('node:fs/promises');
const path = require('node:path');
const forge = require('node-forge');

const DEFAULT_MAX_PFX_BYTES = 2 * 1024 * 1024;
const CERTIFICATE_FILE_READ_CHUNK_BYTES = 64 * 1024;

async function extractPfxToPem(filePath, passphrase = '', options = {}) {
  const bundleLabel = options.bundleLabel || 'client certificate PFX/P12 bundle';
  const maxBytes = normalizedMaxBytes(options.maxBytes);
  const bundle = await readRegularFileBounded(filePath, bundleLabel, maxBytes);
  let p12;
  try {
    const der = forge.util.createBuffer(bundle.toString('binary'), 'binary');
    const asn1 = forge.asn1.fromDer(der);
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, passphrase || '');
  } catch (error) {
    throw new Error(`${bundleLabel} could not be extracted: ${pfxParseErrorReason(error)}.`);
  }

  const keyBag = firstBag(p12, [
    forge.pki.oids.pkcs8ShroudedKeyBag,
    forge.pki.oids.keyBag
  ], (bag) => bag.key);
  const certificateBags = bagsForTypes(p12, [forge.pki.oids.certBag]).filter((bag) => bag.cert);
  const privateKey = keyBag?.key ? forge.pki.privateKeyToPem(keyBag.key) : '';
  const certificates = orderedCertificateBags(certificateBags, keyBag)
    .map((bag) => forge.pki.certificateToPem(bag.cert));
  if (!privateKey) {
    throw new Error(`${bundleLabel} did not contain a private key.`);
  }
  if (!certificates.length) {
    throw new Error(`${bundleLabel} did not contain a certificate chain.`);
  }
  return {
    certChain: Buffer.from(certificates.join('\n'), 'utf8'),
    privateKey: Buffer.from(privateKey, 'utf8')
  };
}

async function readRegularFileBounded(filePath, label, maxBytes = DEFAULT_MAX_PFX_BYTES) {
  const maxFileBytes = normalizedMaxBytes(maxBytes);
  const resolved = path.resolve(filePath);
  let handle;
  try {
    handle = await fs.open(resolved, 'r');
  } catch (error) {
    throw new Error(`Unable to read ${label}: ${fileErrorReason(error)}.`);
  }

  try {
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new Error(`${label} must be a regular file.`);
    }
    if (stat.size > maxFileBytes) {
      throw new Error(`${label} cannot exceed ${maxFileBytes} bytes.`);
    }

    const chunks = [];
    let total = 0;
    const chunkSize = Math.max(1, Math.min(CERTIFICATE_FILE_READ_CHUNK_BYTES, maxFileBytes + 1));
    const buffer = Buffer.alloc(chunkSize);
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) {
        break;
      }
      total += bytesRead;
      if (total > maxFileBytes) {
        throw new Error(`${label} cannot exceed ${maxFileBytes} bytes.`);
      }
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    }
    return Buffer.concat(chunks, total);
  } catch (error) {
    if (isOwnFileReadError(error, label)) {
      throw error;
    }
    throw new Error(`Unable to read ${label}: ${fileErrorReason(error)}.`);
  } finally {
    await handle.close().catch(() => {});
  }
}

function normalizedMaxBytes(maxBytes) {
  const numeric = Math.floor(Number(maxBytes || DEFAULT_MAX_PFX_BYTES));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : DEFAULT_MAX_PFX_BYTES;
}

function isOwnFileReadError(error, label) {
  const message = String(error?.message || '');
  return message.startsWith(`${label} must be a regular file.`)
    || message.startsWith(`${label} cannot exceed `)
    || message.startsWith(`Unable to read ${label}:`);
}

function fileErrorReason(error) {
  return error?.code || error?.message || 'unknown error';
}

function decryptPemPrivateKey(privateKeyPem, passphrase = '', label = 'PEM key') {
  const text = Buffer.isBuffer(privateKeyPem) ? privateKeyPem.toString('utf8') : String(privateKeyPem || '');
  if (!isEncryptedPemPrivateKey(text)) {
    return Buffer.from(text, 'utf8');
  }
  if (!passphrase) {
    throw new Error(`${label} is encrypted and requires a passphrase.`);
  }
  try {
    const privateKey = decryptPrivateKey(text, passphrase);
    if (!privateKey) {
      throw new Error('invalid passphrase or encrypted-key failure');
    }
    return Buffer.from(forge.pki.privateKeyToPem(privateKey), 'utf8');
  } catch (error) {
    throw new Error(`${label} could not be decrypted: ${pfxParseErrorReason(error)}.`);
  }
}

function isEncryptedPemPrivateKey(text) {
  return /-----BEGIN ENCRYPTED PRIVATE KEY-----/.test(text)
    || /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?Proc-Type:\s*4,ENCRYPTED/i.test(text);
}

function decryptPrivateKey(text, passphrase) {
  const rsaPrivateKey = forge.pki.decryptRsaPrivateKey(text, passphrase);
  if (rsaPrivateKey) {
    return rsaPrivateKey;
  }
  const encryptedBlock = forge.pem.decode(text).find((block) => block.type === 'ENCRYPTED PRIVATE KEY');
  if (!encryptedBlock) {
    return null;
  }
  const encryptedInfo = forge.asn1.fromDer(forge.util.createBuffer(encryptedBlock.body, 'binary'));
  const privateKeyInfo = forge.pki.decryptPrivateKeyInfo(encryptedInfo, passphrase);
  return privateKeyInfo ? forge.pki.privateKeyFromAsn1(privateKeyInfo) : null;
}

function firstBag(p12, bagTypes, predicate = () => true) {
  return bagsForTypes(p12, bagTypes).find(predicate) || null;
}

function bagsForTypes(p12, bagTypes) {
  return bagTypes.flatMap((bagType) => p12.getBags({ bagType })[bagType] || []);
}

function orderedCertificateBags(certificateBags, keyBag) {
  const keyId = firstAttributeValue(keyBag, 'localKeyId');
  if (!keyId) {
    return certificateBags;
  }
  const matching = [];
  const remaining = [];
  for (const bag of certificateBags) {
    if (firstAttributeValue(bag, 'localKeyId') === keyId) {
      matching.push(bag);
    } else {
      remaining.push(bag);
    }
  }
  return [...matching, ...remaining];
}

function firstAttributeValue(bag, name) {
  const values = bag?.attributes?.[name];
  if (!Array.isArray(values) || values.length === 0) {
    return '';
  }
  return forge.util.bytesToHex(String(values[0] || ''));
}

function pfxParseErrorReason(error) {
  const message = String(error?.message || error || 'unknown error');
  if (/Invalid password|MAC could not be verified|Unable to decrypt|password/i.test(message)) {
    return 'invalid passphrase or encrypted-key failure';
  }
  if (/Unsupported|not supported|unknown|OID/i.test(message)) {
    return `unsupported bundle algorithm (${message})`;
  }
  return message;
}

module.exports = {
  DEFAULT_MAX_PFX_BYTES,
  decryptPemPrivateKey,
  extractPfxToPem,
  readRegularFileBounded
};
