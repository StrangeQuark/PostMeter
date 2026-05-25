(function attachRendererUiUtilities(global) {
  const AUTOMATED_UI_SMOKE_QUERY_KEYS = Object.freeze([
    'uiWorkflowSmoke',
    'uiRegressionSmoke',
    'uiSnapshotSmoke',
    'uiTypographySmoke',
    'uiOauthSmoke',
    'uiHawkSmoke',
    'uiAwsSmoke',
    'uiA11ySmoke',
    'uiAuthMatrixSmoke'
  ]);

  function formatBytes(bytes) {
    const value = Math.max(0, Number(bytes || 0));
    if (value < 1024) {
      return `${value} B`;
    }
    if (value < 1024 * 1024) {
      return `${(value / 1024).toFixed(1)} KB`;
    }
    if (value < 1024 * 1024 * 1024) {
      return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function notificationPayload(title, message) {
    return {
      title: String(title || 'PostMeter'),
      message: String(message || '')
    };
  }

  function isAutomatedUiSmokeSearch(search) {
    const params = new URLSearchParams(String(search || ''));
    return AUTOMATED_UI_SMOKE_QUERY_KEYS.some((key) => params.get(key) === '1');
  }

  const exported = {
    AUTOMATED_UI_SMOKE_QUERY_KEYS,
    formatBytes,
    isAutomatedUiSmokeSearch,
    notificationPayload
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
  global.PostMeterRendererUiUtilities = exported;
})(typeof window !== 'undefined' ? window : globalThis);
