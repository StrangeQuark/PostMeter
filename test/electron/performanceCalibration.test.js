const assert = require('node:assert/strict');
const test = require('node:test');
const {
  runPerformanceCalibration,
  summarizeCalibrationStages
} = require('../../src/core/performanceCalibration');

function fastProfile(overrides = {}) {
  return {
    warmupTargetRequestsPerSecond: 10,
    warmupDurationMillis: 80,
    probeDurationMillis: 120,
    confirmationDurationMillis: 120,
    confirmationPasses: 2,
    sampleIntervalMillis: 40,
    schedulerTickMillis: 5,
    maxLatencySamples: 1000,
    maxConcurrency: 16,
    inFlightWindowMillis: 100,
    targetRates: [10, 20, 40],
    probeFailureStopCount: 2,
    maxConfirmationCandidates: 3,
    maxCalibrationDurationMillis: 5000,
    minCalibrationStageDurationMillis: 20,
    minCompletionRatio: 0.75,
    minIntervalRatio: 0,
    maxP95StartLagMillis: 1000,
    maxP95EventLoopDelayMillis: 1000,
    maxConfirmationVariationPercent: 100,
    ...overrides
  };
}

test('performance calibration confirms a repeatable target-rate local cap', async () => {
  const progress = [];
  const result = await runPerformanceCalibration({
    profile: fastProfile(),
    onProgress: (event) => progress.push(event)
  });

  assert.equal(result.cancelled, false);
  assert.equal(result.endpoint, '127.0.0.1');
  assert.ok(result.stages.some((stage) => stage.mode === 'warmup'));
  assert.ok(result.stages.some((stage) => stage.mode === 'probe'));
  assert.ok(result.stages.some((stage) => stage.mode === 'confirmation'));
  assert.ok(result.summary.completedRequests > 0);
  assert.equal(result.summary.failedRequests, 0);
  assert.ok(result.summary.peakRequestsPerSecond > 0);
  assert.ok(result.summary.sustainedRequestsPerSecond > 0);
  assert.ok(result.summary.reliableTargetRequestsPerSecond > 0);
  assert.ok(result.summary.recommendedMaxRequestsPerSecond > 0);
  assert.ok(result.summary.confirmationTargetsTested >= 1);
  assert.ok(result.summary.measurementVariationPercent >= 0);
  assert.ok(result.summary.repeatabilityPercent >= 0);
  assert.ok(result.summary.p95StartLagMillis >= 0);
  assert.ok(result.summary.p95EventLoopDelayMillis >= 0);
  assert.match(result.summary.notes.join(' '), /confirmed this machine can sustain/);
  assert.equal(progress.some((event) => event.kind === 'calibration' && event.phase === 'warmup'), true);
  assert.equal(progress.some((event) => event.kind === 'calibration' && event.phase === 'confirm'), true);
  assert.equal(progress.at(-1).percent, 100);
});

test('performance calibration keeps the automatic sweep bounded', async () => {
  const result = await runPerformanceCalibration({
    responseDelayMillis: 35,
    profile: fastProfile({
      warmupTargetRequestsPerSecond: 20,
      targetRates: [20, 40, 80, 160, 320],
      maxConcurrency: 2,
      inFlightWindowMillis: 20,
      confirmationPasses: 2,
      maxConfirmationCandidates: 3,
      probeFailureStopCount: 2,
      maxCalibrationDurationMillis: 5000
    })
  });

  const probeStages = result.stages.filter((stage) => stage.mode === 'probe');
  const confirmationStages = result.stages.filter((stage) => stage.mode === 'confirmation');

  assert.equal(result.cancelled, false);
  assert.ok(probeStages.length < 5);
  assert.ok(confirmationStages.length <= 6);
  assert.ok(result.durationMillis < 5000);
});

test('performance calibration lowers confidence when targets cannot be reached', async () => {
  const result = await runPerformanceCalibration({
    responseDelayMillis: 40,
    profile: fastProfile({
      targetRates: [100, 200],
      warmupTargetRequestsPerSecond: 50,
      maxConcurrency: 1,
      inFlightWindowMillis: 1,
      minCompletionRatio: 0.95,
      maxP95StartLagMillis: 5,
      confirmationPasses: 1
    })
  });

  assert.equal(result.cancelled, false);
  assert.ok(result.stages.some((stage) => stage.accepted === false && stage.failureReasons.length > 0));
  assert.equal(result.summary.confidence, 'low');
  assert.ok(result.summary.recommendedMaxRequestsPerSecond >= 0);
  assert.match(result.summary.notes.join(' '), /lower-confidence estimate/);
});

test('performance calibration still supports bounded fixed-request test stages', async () => {
  const result = await runPerformanceCalibration({
    profile: fastProfile(),
    stages: [
      { name: 'Unit single', concurrency: 1, requests: 6 },
      { name: 'Unit parallel', concurrency: 2, requests: 10 }
    ]
  });

  assert.equal(result.cancelled, false);
  assert.equal(result.endpoint, '127.0.0.1');
  assert.equal(result.stages.length, 2);
  assert.equal(result.stages[0].mode, 'fixed');
  assert.equal(result.summary.completedRequests, 16);
  assert.equal(result.summary.failedRequests, 0);
  assert.ok(result.summary.peakRequestsPerSecond > 0);
  assert.ok(result.summary.p95LatencyMillis >= 0);
  assert.match(result.summary.notes.join(' '), /Loopback calibration/);
});

test('performance calibration cancellation returns bounded partial results', async () => {
  const controller = new AbortController();
  const run = runPerformanceCalibration({
    signal: controller.signal,
    profile: fastProfile(),
    responseDelayMillis: 5,
    stages: [
      { name: 'Cancellable', concurrency: 4, durationMillis: 1000 }
    ]
  });
  setTimeout(() => controller.abort(), 20);

  const result = await run;
  assert.equal(result.cancelled, true);
  assert.equal(result.endpoint, '127.0.0.1');
  assert.equal(result.stages.length, 1);
  assert.equal(result.stages[0].mode, 'duration');
  assert.ok(result.stages[0].durationMillis < 1000);
});

test('performance calibration summary uses confirmed repeatable target before peak', () => {
  const summary = summarizeCalibrationStages([
    { mode: 'probe', accepted: true, targetRequestsPerSecond: 100, requestsPerSecond: 100, completedRequests: 10, failedRequests: 0, averageLatencyMillis: 2, p95LatencyMillis: 3, maxInFlightRequests: 2 },
    { mode: 'probe', accepted: true, targetRequestsPerSecond: 200, requestsPerSecond: 200, completedRequests: 20, failedRequests: 0, averageLatencyMillis: 4, p95LatencyMillis: 8, maxInFlightRequests: 4 },
    { mode: 'confirmation', accepted: true, confirmed: true, confirmationTargetRequestsPerSecond: 120, targetRequestsPerSecond: 120, requestsPerSecond: 110, completedRequests: 30, failedRequests: 0, averageLatencyMillis: 5, p95LatencyMillis: 9, maxInFlightRequests: 3 },
    { mode: 'confirmation', accepted: true, confirmed: true, confirmationTargetRequestsPerSecond: 120, targetRequestsPerSecond: 120, requestsPerSecond: 100, completedRequests: 30, failedRequests: 0, averageLatencyMillis: 5, p95LatencyMillis: 10, maxInFlightRequests: 3 }
  ], { profile: fastProfile({ safetyMargin: 0.8 }) });

  assert.equal(summary.peakRequestsPerSecond, 200);
  assert.equal(summary.peakConcurrency, 4);
  assert.equal(summary.sustainedRequestsPerSecond, 100);
  assert.equal(summary.reliableTargetRequestsPerSecond, 120);
  assert.equal(summary.recommendedMaxRequestsPerSecond, 80);
  assert.equal(summary.completedRequests, 90);
  assert.equal(summary.failedRequests, 0);
  assert.equal(summary.p95LatencyMillis, 10);
  assert.equal(summary.confidence, 'high');
});

test('performance calibration summary reports highest confirmed edge and next failed bound', () => {
  const summary = summarizeCalibrationStages([
    { mode: 'confirmation', accepted: false, confirmed: false, confirmationTargetRequestsPerSecond: 300, targetRequestsPerSecond: 300, requestsPerSecond: 260, completedRequests: 26, failedRequests: 0, averageLatencyMillis: 6, p95LatencyMillis: 12, p95StartLagMillis: 20, p95EventLoopDelayMillis: 15, maxInFlightRequests: 8 },
    { mode: 'confirmation', accepted: false, confirmed: false, confirmationTargetRequestsPerSecond: 300, targetRequestsPerSecond: 300, requestsPerSecond: 250, completedRequests: 25, failedRequests: 0, averageLatencyMillis: 7, p95LatencyMillis: 13, p95StartLagMillis: 25, p95EventLoopDelayMillis: 16, maxInFlightRequests: 8 },
    { mode: 'confirmation', accepted: true, confirmed: true, confirmationTargetRequestsPerSecond: 250, targetRequestsPerSecond: 250, requestsPerSecond: 248, completedRequests: 25, failedRequests: 0, averageLatencyMillis: 4, p95LatencyMillis: 8, p95StartLagMillis: 5, p95EventLoopDelayMillis: 10, maxInFlightRequests: 6 },
    { mode: 'confirmation', accepted: true, confirmed: true, confirmationTargetRequestsPerSecond: 250, targetRequestsPerSecond: 250, requestsPerSecond: 246, completedRequests: 25, failedRequests: 0, averageLatencyMillis: 4, p95LatencyMillis: 9, p95StartLagMillis: 6, p95EventLoopDelayMillis: 11, maxInFlightRequests: 6 }
  ], { profile: fastProfile({ safetyMargin: 0.8 }) });

  assert.equal(summary.reliableTargetRequestsPerSecond, 250);
  assert.equal(summary.edgeUpperBoundRequestsPerSecond, 300);
  assert.equal(summary.recommendedMaxRequestsPerSecond, 196);
  assert.equal(summary.confirmationTargetsTested, 2);
  assert.match(summary.notes.join(' '), /next tested candidate, 300 RPS/);
});

test('performance calibration summary ignores isolated high confirmations without lower-target support', () => {
  const summary = summarizeCalibrationStages([
    { mode: 'confirmation', accepted: true, confirmed: true, confirmationTargetRequestsPerSecond: 200, targetRequestsPerSecond: 200, requestsPerSecond: 199, completedRequests: 20, failedRequests: 0, averageLatencyMillis: 3, p95LatencyMillis: 5, p95StartLagMillis: 4, p95EventLoopDelayMillis: 6, maxInFlightRequests: 4 },
    { mode: 'confirmation', accepted: true, confirmed: true, confirmationTargetRequestsPerSecond: 200, targetRequestsPerSecond: 200, requestsPerSecond: 198, completedRequests: 20, failedRequests: 0, averageLatencyMillis: 3, p95LatencyMillis: 5, p95StartLagMillis: 4, p95EventLoopDelayMillis: 6, maxInFlightRequests: 4 },
    { mode: 'confirmation', accepted: false, confirmed: false, confirmationTargetRequestsPerSecond: 250, targetRequestsPerSecond: 250, requestsPerSecond: 220, completedRequests: 22, failedRequests: 0, averageLatencyMillis: 8, p95LatencyMillis: 18, p95StartLagMillis: 40, p95EventLoopDelayMillis: 20, maxInFlightRequests: 8 },
    { mode: 'confirmation', accepted: false, confirmed: false, confirmationTargetRequestsPerSecond: 250, targetRequestsPerSecond: 250, requestsPerSecond: 225, completedRequests: 22, failedRequests: 0, averageLatencyMillis: 8, p95LatencyMillis: 18, p95StartLagMillis: 40, p95EventLoopDelayMillis: 20, maxInFlightRequests: 8 },
    { mode: 'confirmation', accepted: true, confirmed: true, confirmationTargetRequestsPerSecond: 300, targetRequestsPerSecond: 300, requestsPerSecond: 299, completedRequests: 30, failedRequests: 0, averageLatencyMillis: 4, p95LatencyMillis: 7, p95StartLagMillis: 5, p95EventLoopDelayMillis: 7, maxInFlightRequests: 5 },
    { mode: 'confirmation', accepted: true, confirmed: true, confirmationTargetRequestsPerSecond: 300, targetRequestsPerSecond: 300, requestsPerSecond: 298, completedRequests: 30, failedRequests: 0, averageLatencyMillis: 4, p95LatencyMillis: 7, p95StartLagMillis: 5, p95EventLoopDelayMillis: 7, maxInFlightRequests: 5 }
  ], { profile: fastProfile({ safetyMargin: 0.8 }) });

  assert.equal(summary.reliableTargetRequestsPerSecond, 200);
  assert.equal(summary.edgeUpperBoundRequestsPerSecond, 250);
  assert.equal(summary.confirmationTargetsTested, 3);
});

test('performance calibration summary uses failed probe targets as upper bounds', () => {
  const summary = summarizeCalibrationStages([
    { mode: 'probe', accepted: true, targetRequestsPerSecond: 200, requestsPerSecond: 200, completedRequests: 20, failedRequests: 0, averageLatencyMillis: 3, p95LatencyMillis: 5, maxInFlightRequests: 4 },
    { mode: 'probe', accepted: false, targetRequestsPerSecond: 275, requestsPerSecond: 260, completedRequests: 26, failedRequests: 0, averageLatencyMillis: 6, p95LatencyMillis: 10, maxInFlightRequests: 8 },
    { mode: 'confirmation', accepted: true, confirmed: true, confirmationTargetRequestsPerSecond: 250, targetRequestsPerSecond: 250, requestsPerSecond: 249, completedRequests: 25, failedRequests: 0, averageLatencyMillis: 4, p95LatencyMillis: 7, p95StartLagMillis: 5, p95EventLoopDelayMillis: 7, maxInFlightRequests: 5 },
    { mode: 'confirmation', accepted: true, confirmed: true, confirmationTargetRequestsPerSecond: 250, targetRequestsPerSecond: 250, requestsPerSecond: 248, completedRequests: 25, failedRequests: 0, averageLatencyMillis: 4, p95LatencyMillis: 7, p95StartLagMillis: 5, p95EventLoopDelayMillis: 7, maxInFlightRequests: 5 }
  ], { profile: fastProfile({ safetyMargin: 0.8 }) });

  assert.equal(summary.reliableTargetRequestsPerSecond, 250);
  assert.equal(summary.edgeUpperBoundRequestsPerSecond, 275);
});

test('performance calibration summary rejects near-edge targets with local latency knee', () => {
  const summary = summarizeCalibrationStages([
    { mode: 'confirmation', accepted: true, confirmed: true, confirmationTargetRequestsPerSecond: 24000, targetRequestsPerSecond: 24000, requestsPerSecond: 23995, completedRequests: 100, failedRequests: 0, averageLatencyMillis: 4, p95LatencyMillis: 8, p95StartLagMillis: 5, p95EventLoopDelayMillis: 8, maxInFlightRequests: 120 },
    { mode: 'confirmation', accepted: true, confirmed: true, confirmationTargetRequestsPerSecond: 24000, targetRequestsPerSecond: 24000, requestsPerSecond: 23996, completedRequests: 100, failedRequests: 0, averageLatencyMillis: 4, p95LatencyMillis: 8.5, p95StartLagMillis: 5, p95EventLoopDelayMillis: 8, maxInFlightRequests: 120 },
    { mode: 'confirmation', accepted: true, confirmed: true, confirmationTargetRequestsPerSecond: 28000, targetRequestsPerSecond: 28000, requestsPerSecond: 27995, completedRequests: 100, failedRequests: 0, averageLatencyMillis: 12, p95LatencyMillis: 24, p95StartLagMillis: 10, p95EventLoopDelayMillis: 15, maxInFlightRequests: 180 },
    { mode: 'confirmation', accepted: true, confirmed: true, confirmationTargetRequestsPerSecond: 28000, targetRequestsPerSecond: 28000, requestsPerSecond: 27996, completedRequests: 100, failedRequests: 0, averageLatencyMillis: 12, p95LatencyMillis: 25, p95StartLagMillis: 10, p95EventLoopDelayMillis: 15, maxInFlightRequests: 180 }
  ], {
    profile: fastProfile({
      safetyMargin: 0.8,
      maxConfirmationLatencyGrowthMultiplier: 1.75,
      maxConfirmationLatencyGrowthMillis: 6
    })
  });

  assert.equal(summary.reliableTargetRequestsPerSecond, 24000);
  assert.equal(summary.edgeUpperBoundRequestsPerSecond, 28000);
  assert.equal(summary.peakRequestsPerSecond, 27996);
});
