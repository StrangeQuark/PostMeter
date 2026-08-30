function normalizeArtifactSecurity(value = {}) {
  return { importedUntrusted: value?.importedUntrusted === true };
}

function markArtifactImportedUntrusted(artifact) {
  if (!artifact || typeof artifact !== 'object') {
    return artifact;
  }
  artifact.security = { ...normalizeArtifactSecurity(artifact.security), importedUntrusted: true };
  return artifact;
}

function artifactIsImportedUntrusted(...artifacts) {
  return artifacts.some((artifact) => artifact?.security?.importedUntrusted === true);
}

function preserveArtifactSecurity(current, next) {
  if (!current?.security?.importedUntrusted || !next || typeof next !== 'object') {
    return next;
  }
  return {
    ...next,
    security: { ...normalizeArtifactSecurity(next.security), importedUntrusted: true }
  };
}

module.exports = {
  artifactIsImportedUntrusted,
  markArtifactImportedUntrusted,
  normalizeArtifactSecurity,
  preserveArtifactSecurity
};
