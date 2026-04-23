const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const {
  exportSecretConfirmationPhrase,
  matchesExportSecretConfirmation
} = require('../../electron/exportConfirmation');

test('secret export confirmation copy is explicit about exact plaintext values', async () => {
  const html = await fs.readFile(path.join(__dirname, '..', '..', 'electron', 'secretExportPrompt.html'), 'utf8');

  assert.match(html, /Export exact secret values/);
  assert.match(html, /tokens, passwords, and secret variables without redaction/);
  assert.equal(exportSecretConfirmationPhrase('workspace'), 'EXPORT WORKSPACE SECRETS');
  assert.equal(matchesExportSecretConfirmation('workspace', 'EXPORT WORKSPACE SECRETS'), true);
  assert.equal(matchesExportSecretConfirmation('workspace', 'export workspace secrets'), false);
});

test('passphrase prompt copy points users to local recovery guidance without implying cloud recovery', async () => {
  const html = await fs.readFile(path.join(__dirname, '..', '..', 'electron', 'passphrasePrompt.html'), 'utf8');

  assert.match(html, /fallback passphrase/);
  assert.match(html, /docs\/SECRETS\.md/);
  assert.doesNotMatch(html, /cloud vault/i);
  assert.doesNotMatch(html, /account login/i);
});
