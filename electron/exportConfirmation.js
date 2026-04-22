function exportSecretConfirmationPhrase(scope) {
  return `EXPORT ${String(scope || '').trim().toUpperCase()} SECRETS`;
}

function matchesExportSecretConfirmation(scope, value) {
  return value === exportSecretConfirmationPhrase(scope);
}

module.exports = {
  exportSecretConfirmationPhrase,
  matchesExportSecretConfirmation
};
