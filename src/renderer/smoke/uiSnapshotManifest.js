(function attachUiSnapshotManifest(global) {
  const UI_SNAPSHOT_LABELS = Object.freeze([
    'empty-state',
    'request',
    'environment-editor',
    'workspace-panel',
    'context-menu',
    'cookies',
    'auth-oauth',
    'auth-basic-bearer',
    'body-formdata',
    'body-graphql',
    'response',
    'response-headers-cookies',
    'test-results',
    'runner-editor',
    'runner',
    'performance-editor',
    'performance-calibration',
    'settings-general',
    'settings-certificates',
    'diagnostics-settings',
    'package-cache',
    'file-bindings',
    'vault-prompt',
    'tutorial-overlay',
    'workspace-sandbox',
    'long-labels',
    'export-menu'
  ]);

  const exported = {
    UI_SNAPSHOT_LABELS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterUiSnapshotManifest = exported;
})(typeof window === 'undefined' ? globalThis : window);
