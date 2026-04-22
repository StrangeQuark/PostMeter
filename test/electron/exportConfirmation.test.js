const assert = require('node:assert/strict');
const test = require('node:test');
const {
  exportSecretConfirmationPhrase,
  matchesExportSecretConfirmation
} = require('../../electron/exportConfirmation');

test('requires an exact typed phrase before exporting exact secret values', () => {
  assert.equal(exportSecretConfirmationPhrase('workspace'), 'EXPORT WORKSPACE SECRETS');
  assert.equal(matchesExportSecretConfirmation('workspace', 'EXPORT WORKSPACE SECRETS'), true);
  assert.equal(matchesExportSecretConfirmation('workspace', 'export workspace secrets'), false);
  assert.equal(matchesExportSecretConfirmation('collection', 'EXPORT WORKSPACE SECRETS'), false);
});
