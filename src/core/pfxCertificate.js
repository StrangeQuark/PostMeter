const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DEFAULT_MAX_PFX_BYTES = 2 * 1024 * 1024;

async function extractPfxToPem(filePath, passphrase = '', options = {}) {
  const bundleLabel = options.bundleLabel || 'client certificate PFX/P12 bundle';
  const maxBytes = options.maxBytes || DEFAULT_MAX_PFX_BYTES;
  const resolved = path.resolve(filePath);
  const stat = await fs.stat(resolved).catch((error) => {
    throw new Error(`Unable to read ${bundleLabel}: ${error?.code || error?.message || 'unknown error'}.`);
  });
  if (!stat.isFile()) {
    throw new Error(`${bundleLabel} must be a regular file.`);
  }
  if (stat.size > maxBytes) {
    throw new Error(`${bundleLabel} cannot exceed ${maxBytes} bytes.`);
  }

  const pem = await runOpenSslPkcs12(resolved, passphrase, false, options)
    .catch(async (error) => {
      if (/unsupported|legacy|invalid password|mac verify failure|bad decrypt/i.test(error.message || '')) {
        return runOpenSslPkcs12(resolved, passphrase, true, options);
      }
      throw error;
    });
  const privateKey = firstPemBlock(pem, ['PRIVATE KEY', 'RSA PRIVATE KEY', 'EC PRIVATE KEY']);
  const certificates = pemBlocks(pem, 'CERTIFICATE');
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

async function runOpenSslPkcs12(pfxPath, passphrase, legacy, options = {}) {
  const bundleLabel = options.bundleLabel || 'client certificate PFX/P12 bundle';
  const tempPrefix = options.tempPrefix || 'postmeter-pfx-';
  const envPassphraseName = options.envPassphraseName || 'POSTMETER_PFX_PASSPHRASE';
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), tempPrefix));
  const outputPath = path.join(tempDir, 'bundle.pem');
  try {
    const args = [
      'pkcs12',
      '-in',
      pfxPath,
      '-nodes',
      '-passin',
      `env:${envPassphraseName}`,
      '-out',
      outputPath
    ];
    if (legacy) {
      args.splice(1, 0, '-legacy');
    }
    await runCommand('openssl', args, {
      [envPassphraseName]: passphrase || ''
    });
    return fs.readFile(outputPath, 'utf8');
  } catch (error) {
    throw new Error(`${bundleLabel} could not be extracted: ${error.message || String(error)}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function runCommand(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${code}: ${stderr.trim()}`));
    });
  });
}

function firstPemBlock(text, labels) {
  for (const label of labels) {
    const block = pemBlocks(text, label)[0];
    if (block) {
      return block;
    }
  }
  return '';
}

function pemBlocks(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`-----BEGIN ${escaped}-----[\\s\\S]*?-----END ${escaped}-----`, 'g');
  return String(text || '').match(pattern) || [];
}

module.exports = {
  DEFAULT_MAX_PFX_BYTES,
  extractPfxToPem
};
