'use strict';

// Test-only UI smoke harness. Production renderer code calls only the queue* entry points.

(function attachUiSmoke(global) {
  const { queueUiSmokeRun } = resolveUiSmokeCommon(global);
  const { runUiWorkflowSmoke } = resolveUiSmokeWorkflow(global);
  const { runUiRegressionSmoke } = resolveUiSmokeRegression(global);
  const { runUiSnapshotSmoke } = resolveUiSmokeSnapshot(global);
  const { runUiTypographySmoke } = resolveUiSmokeTypography(global);
  const { runUiOauthSmoke } = resolveUiSmokeOauth(global);
  const { runUiHawkSmoke } = resolveUiSmokeHawk(global);

  function queueUiWorkflowSmoke() {
    queueUiSmokeRun({
      flag: 'uiWorkflowSmoke',
      run: runUiWorkflowSmoke,
      runtimeGlobal: global,
      titlePrefix: 'PostMeter UI Workflow'
    });
  }

  function queueUiRegressionSmoke() {
    queueUiSmokeRun({
      flag: 'uiRegressionSmoke',
      run: runUiRegressionSmoke,
      runtimeGlobal: global,
      titlePrefix: 'PostMeter UI Regression'
    });
  }

  function queueUiSnapshotSmoke() {
    queueUiSmokeRun({
      flag: 'uiSnapshotSmoke',
      run: runUiSnapshotSmoke,
      runtimeGlobal: global,
      titlePrefix: 'PostMeter UI Snapshot'
    });
  }

  function queueUiTypographySmoke() {
    queueUiSmokeRun({
      flag: 'uiTypographySmoke',
      run: runUiTypographySmoke,
      runtimeGlobal: global,
      titlePrefix: 'PostMeter UI Typography'
    });
  }

  function queueUiOauthSmoke() {
    queueUiSmokeRun({
      flag: 'uiOauthSmoke',
      run: runUiOauthSmoke,
      runtimeGlobal: global,
      titlePrefix: 'PostMeter UI OAuth'
    });
  }

  function queueUiHawkSmoke() {
    queueUiSmokeRun({
      flag: 'uiHawkSmoke',
      run: runUiHawkSmoke,
      runtimeGlobal: global,
      titlePrefix: 'PostMeter UI Hawk'
    });
  }

  function resolveUiSmokeCommon(runtimeGlobal) {
    if (runtimeGlobal.PostMeterUiSmokeCommon) {
      return runtimeGlobal.PostMeterUiSmokeCommon;
    }
    if (typeof module !== 'undefined' && module.exports) {
      return require('./uiSmokeCommon');
    }
    throw new Error('PostMeter UI smoke common helpers must load before uiSmoke.js.');
  }

  function resolveUiSmokeWorkflow(runtimeGlobal) {
    if (runtimeGlobal.PostMeterUiWorkflowSmoke) {
      return runtimeGlobal.PostMeterUiWorkflowSmoke;
    }
    if (typeof module !== 'undefined' && module.exports) {
      return require('./uiWorkflowSmoke');
    }
    throw new Error('PostMeter UI workflow smoke helpers must load before uiSmoke.js.');
  }

  function resolveUiSmokeRegression(runtimeGlobal) {
    if (runtimeGlobal.PostMeterUiRegressionSmoke) {
      return runtimeGlobal.PostMeterUiRegressionSmoke;
    }
    if (typeof module !== 'undefined' && module.exports) {
      return require('./uiRegressionSmoke');
    }
    throw new Error('PostMeter UI regression smoke helpers must load before uiSmoke.js.');
  }

  function resolveUiSmokeSnapshot(runtimeGlobal) {
    if (runtimeGlobal.PostMeterUiSnapshotSmoke) {
      return runtimeGlobal.PostMeterUiSnapshotSmoke;
    }
    if (typeof module !== 'undefined' && module.exports) {
      return require('./uiSnapshotSmoke');
    }
    throw new Error('PostMeter UI snapshot smoke helpers must load before uiSmoke.js.');
  }

  function resolveUiSmokeTypography(runtimeGlobal) {
    if (runtimeGlobal.PostMeterUiTypographySmoke) {
      return runtimeGlobal.PostMeterUiTypographySmoke;
    }
    if (typeof module !== 'undefined' && module.exports) {
      return require('./uiTypographySmoke');
    }
    throw new Error('PostMeter UI typography smoke helpers must load before uiSmoke.js.');
  }

  function resolveUiSmokeOauth(runtimeGlobal) {
    if (runtimeGlobal.PostMeterUiOauthSmoke) {
      return runtimeGlobal.PostMeterUiOauthSmoke;
    }
    if (typeof module !== 'undefined' && module.exports) {
      return require('./uiOauthSmoke');
    }
    throw new Error('PostMeter UI OAuth smoke helpers must load before uiSmoke.js.');
  }

  function resolveUiSmokeHawk(runtimeGlobal) {
    if (runtimeGlobal.PostMeterUiHawkSmoke) {
      return runtimeGlobal.PostMeterUiHawkSmoke;
    }
    if (typeof module !== 'undefined' && module.exports) {
      return require('./uiHawkSmoke');
    }
    throw new Error('PostMeter UI Hawk smoke helpers must load before uiSmoke.js.');
  }

  const exported = {
    queueUiHawkSmoke,
    queueUiOauthSmoke,
    queueUiRegressionSmoke,
    queueUiSnapshotSmoke,
    queueUiTypographySmoke,
    queueUiWorkflowSmoke
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.queueUiWorkflowSmoke = queueUiWorkflowSmoke;
  global.queueUiRegressionSmoke = queueUiRegressionSmoke;
  global.queueUiSnapshotSmoke = queueUiSnapshotSmoke;
  global.queueUiTypographySmoke = queueUiTypographySmoke;
  global.queueUiOauthSmoke = queueUiOauthSmoke;
  global.queueUiHawkSmoke = queueUiHawkSmoke;
})(typeof window === 'undefined' ? globalThis : window);
