const http = require('node:http');
const path = require('node:path');
const { monitorEventLoopDelay, performance } = require('node:perf_hooks');
const { Worker } = require('node:worker_threads');

const DEFAULT_CALIBRATION_PROFILE = Object.freeze({
  warmupTargetRequestsPerSecond: 1000,
  warmupDurationMillis: 5000,
  probeDurationMillis: 4000,
  confirmationDurationMillis: 10000,
  confirmationPasses: 2,
  targetRates: [500, 1000, 2000, 4000, 8000, 12000, 16000, 20000, 24000, 28000, 32000, 40000, 48000, 64000],
  sampleIntervalMillis: 1000,
  progressIntervalMillis: 1000,
  schedulerTickMillis: 10,
  maxLatencySamples: 100000,
  maxConcurrency: 1024,
  inFlightWindowMillis: 50,
  settleTimeoutMillis: 10000,
  requestTimeoutMillis: 10000,
  minCompletionRatio: 0.985,
  minIntervalRatio: 0.85,
  maxErrorRate: 0.001,
  maxP95StartLagMillis: 250,
  maxP95EventLoopDelayMillis: 100,
  maxConfirmationVariationPercent: 6,
  maxConfirmationLatencyGrowthMultiplier: 1.75,
  maxConfirmationLatencyGrowthMillis: 6,
  maxConfirmationCandidates: 3,
  probeFailureStopCount: 2,
  maxCalibrationDurationMillis: 150000,
  minCalibrationStageDurationMillis: 1500,
  safetyMargin: 0.8
});

class BoundedRecorder {
  constructor(limit) {
    this.limit = Math.max(1, Math.floor(limit || 1));
    this.values = [];
    this.seen = 0;
  }

  add(value) {
    if (!Number.isFinite(value)) {
      return;
    }
    this.seen += 1;
    if (this.values.length < this.limit) {
      this.values.push(value);
      return;
    }
    this.values[this.seen % this.limit] = value;
  }

  snapshot() {
    return this.values.slice();
  }
}

async function runPerformanceCalibration(options = {}) {
  const profile = normalizeProfile({
    ...options.profile,
    ...(Number.isFinite(options.sampleIntervalMillis) ? { sampleIntervalMillis: options.sampleIntervalMillis } : {})
  });
  const startedAt = new Date();
  const stages = [];
  let server = null;
  let agent = null;
  try {
    throwIfAborted(options.signal);
    server = await startCalibrationServer(options);
    agent = new http.Agent({
      keepAlive: true,
      maxSockets: profile.maxConcurrency,
      maxFreeSockets: Math.min(profile.maxConcurrency, 256),
      scheduling: 'lifo'
    });

    if (Array.isArray(options.stages) && options.stages.length > 0) {
      for (const configuredStage of options.stages) {
        const stage = await runConfiguredStage({
          endpoint: server.endpoint,
          agent,
          profile,
          signal: options.signal,
          configuredStage
        });
        stages.push(stage);
        if (options.signal?.aborted) {
          break;
        }
      }
    } else {
      await runRateControlledCalibration({
        endpoint: server.endpoint,
        agent,
        profile,
        signal: options.signal,
        stages,
        onProgress: options.onProgress
      });
    }
  } catch (error) {
    if (!isAbortError(error)) {
      throw error;
    }
  } finally {
    agent?.destroy();
    await server?.close?.();
  }

  const completedAt = new Date();
  const summary = summarizeCalibrationStages(stages, { profile });
  return {
    id: options.id || `performance-calibration-${startedAt.getTime()}`,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMillis: completedAt.getTime() - startedAt.getTime(),
    cancelled: options.signal?.aborted === true,
    endpoint: '127.0.0.1',
    summary,
    stages
  };
}

async function runRateControlledCalibration({ endpoint, agent, profile, signal, stages, onProgress }) {
  const calibrationStartedAt = performance.now();
  emitCalibrationProgress(onProgress, {
    phase: 'warmup',
    phaseLabel: 'Warmup',
    percent: 1,
    message: 'Starting local loopback calibration.'
  });
  const warmup = await runBudgetedTargetRpsStage({
    name: `Warmup ${formatTarget(profile.warmupTargetRequestsPerSecond)} RPS`,
    mode: 'warmup',
    targetRequestsPerSecond: profile.warmupTargetRequestsPerSecond,
    durationMillis: profile.warmupDurationMillis,
    calibrationStartedAt,
    endpoint,
    agent,
    profile,
    signal,
    onProgress: createStageProgressEmitter(onProgress, {
      phase: 'warmup',
      phaseLabel: 'Warmup',
      percentStart: 1,
      percentEnd: 10,
      stageIndex: 1,
      stageCount: 1
    })
  });
  if (warmup) {
    stages.push(warmup);
  }
  if (signal?.aborted) {
    return;
  }

  const probeStages = [];
  let consecutiveRejectedProbes = 0;
  for (const [targetIndex, target] of profile.targetRates.entries()) {
    const stage = await runBudgetedTargetRpsStage({
      name: `Probe ${formatTarget(target)} RPS`,
      mode: 'probe',
      targetRequestsPerSecond: target,
      durationMillis: profile.probeDurationMillis,
      calibrationStartedAt,
      endpoint,
      agent,
      profile,
      signal,
      onProgress: createStageProgressEmitter(onProgress, {
        phase: 'probe',
        phaseLabel: 'Probe ladder',
        percentStart: 10,
        percentEnd: 35,
        stageIndex: targetIndex + 1,
        stageCount: profile.targetRates.length
      })
    });
    if (!stage) {
      break;
    }
    stages.push(stage);
    probeStages.push(stage);
    if (signal?.aborted) {
      return;
    }
    if (stage.accepted) {
      consecutiveRejectedProbes = 0;
    } else {
      consecutiveRejectedProbes += 1;
      if (consecutiveRejectedProbes >= profile.probeFailureStopCount) {
        break;
      }
    }
  }

  const candidates = buildVerificationTargets(probeStages, profile);
  const candidateRanks = new Map(candidates
    .slice()
    .sort((left, right) => right - left)
    .map((candidate, index) => [candidate, index + 1]));
  const confirmationStagesByTarget = new Map();
  let confirmationStageIndex = 0;
  for (let pass = 1; pass <= profile.confirmationPasses; pass += 1) {
    const orderedCandidates = confirmationOrderForPass(candidates, pass);
    for (const candidate of orderedCandidates) {
      confirmationStageIndex += 1;
      const stage = await runBudgetedTargetRpsStage({
        name: `Confirm ${pass}/${profile.confirmationPasses} ${formatTarget(candidate)} RPS`,
        mode: 'confirmation',
        targetRequestsPerSecond: candidate,
        durationMillis: profile.confirmationDurationMillis,
        calibrationStartedAt,
        endpoint,
        agent,
        profile,
        signal,
        onProgress: createStageProgressEmitter(onProgress, {
          phase: 'confirm',
          phaseLabel: 'Edge confirmation',
          percentStart: 55,
          percentEnd: 98,
          stageIndex: confirmationStageIndex,
          stageCount: Math.max(1, candidates.length * profile.confirmationPasses),
          pass,
          passes: profile.confirmationPasses
        })
      });
      if (!stage) {
        break;
      }
      stage.confirmationTargetRequestsPerSecond = candidate;
      stage.confirmationPass = pass;
      stage.confirmationPasses = profile.confirmationPasses;
      stage.confirmationCandidateRank = candidateRanks.get(candidate) || 0;
      if (!confirmationStagesByTarget.has(candidate)) {
        confirmationStagesByTarget.set(candidate, []);
      }
      confirmationStagesByTarget.get(candidate).push(stage);
      stages.push(stage);
      if (signal?.aborted) {
        return;
      }
    }
    if (signal?.aborted || !calibrationHasBudget(profile, calibrationStartedAt)) {
      break;
    }
  }
  markConfirmationGroups(confirmationStagesByTarget, profile);
  emitCalibrationProgress(onProgress, {
    phase: 'complete',
    phaseLabel: 'Complete',
    percent: 100,
    message: 'Calibration complete.'
  });
}

async function runBudgetedTargetRpsStage({
  calibrationStartedAt,
  durationMillis,
  profile,
  ...stageOptions
}) {
  const budgetedDurationMillis = calibrationStageDurationWithinBudget({
    calibrationStartedAt,
    requestedDurationMillis: durationMillis,
    profile
  });
  if (budgetedDurationMillis <= 0) {
    return null;
  }
  return runTargetRpsStage({
    ...stageOptions,
    durationMillis: budgetedDurationMillis,
    profile
  });
}

function calibrationStageDurationWithinBudget({ calibrationStartedAt, requestedDurationMillis, profile }) {
  if (!Number.isFinite(requestedDurationMillis) || requestedDurationMillis <= 0) {
    return 0;
  }
  const maxDurationMillis = positiveNumber(
    profile.maxCalibrationDurationMillis,
    DEFAULT_CALIBRATION_PROFILE.maxCalibrationDurationMillis
  );
  if (!Number.isFinite(maxDurationMillis) || maxDurationMillis <= 0) {
    return requestedDurationMillis;
  }
  const remainingMillis = maxDurationMillis - Math.max(0, performance.now() - calibrationStartedAt);
  const minimumUsefulStageMillis = Math.min(
    requestedDurationMillis,
    positiveNumber(
      profile.minCalibrationStageDurationMillis,
      DEFAULT_CALIBRATION_PROFILE.minCalibrationStageDurationMillis
    )
  );
  if (remainingMillis < minimumUsefulStageMillis) {
    return 0;
  }
  return Math.max(1, Math.min(requestedDurationMillis, remainingMillis));
}

function calibrationHasBudget(profile, calibrationStartedAt) {
  const maxDurationMillis = positiveNumber(
    profile.maxCalibrationDurationMillis,
    DEFAULT_CALIBRATION_PROFILE.maxCalibrationDurationMillis
  );
  return performance.now() - calibrationStartedAt < maxDurationMillis;
}

function buildVerificationTargets(probeStages = [], profile) {
  const sortedProbeStages = probeStages
    .filter((stage) => safeNumber(stage.targetRequestsPerSecond) > 0)
    .sort((left, right) => safeNumber(left.targetRequestsPerSecond) - safeNumber(right.targetRequestsPerSecond));
  if (sortedProbeStages.length === 0) {
    return [];
  }

  const selectedProbe = selectHighestStableProbeStage(sortedProbeStages, profile);
  if (!selectedProbe) {
    return uniqueNumbers(sortedProbeStages
      .slice(0, Math.min(profile.maxConfirmationCandidates, 2))
      .map((stage) => safeNumber(stage.targetRequestsPerSecond)))
      .sort((left, right) => left - right);
  }

  const selectedTarget = safeNumber(selectedProbe.targetRequestsPerSecond);
  const selectedIndex = sortedProbeStages.findIndex((stage) => safeNumber(stage.targetRequestsPerSecond) === selectedTarget);
  const lowerAccepted = sortedProbeStages
    .slice(0, selectedIndex)
    .reverse()
    .find((stage) => stage.accepted === true);
  const nextHigher = sortedProbeStages
    .slice(selectedIndex + 1)
    .find((stage) => safeNumber(stage.targetRequestsPerSecond) > selectedTarget);
  const targets = [
    selectedTarget,
    safeNumber(nextHigher?.targetRequestsPerSecond),
    safeNumber(lowerAccepted?.targetRequestsPerSecond)
  ];

  return uniqueNumbers(targets)
    .filter((target) => target > 0)
    .slice(0, profile.maxConfirmationCandidates)
    .sort((left, right) => left - right)
}

function selectHighestStableProbeStage(probeStages = [], profile) {
  let selected = null;
  let baselineLatencyMillis = 0;
  for (const stage of probeStages) {
    if (stage.accepted !== true) {
      break;
    }
    const group = {
      confirmed: true,
      p95LatencyMillis: safeNumber(stage.p95LatencyMillis)
    };
    if (!confirmationGroupStaysWithinLatencyEnvelope(group, baselineLatencyMillis, profile)) {
      break;
    }
    selected = stage;
    if (group.p95LatencyMillis > 0 && (baselineLatencyMillis <= 0 || group.p95LatencyMillis < baselineLatencyMillis)) {
      baselineLatencyMillis = group.p95LatencyMillis;
    }
  }
  return selected;
}

function confirmationOrderForPass(candidates, pass) {
  const sorted = candidates.slice().sort((left, right) => left - right);
  return pass % 2 === 0 ? sorted.reverse() : sorted;
}

function markConfirmationGroups(confirmationStagesByTarget, profile) {
  for (const confirmationStages of confirmationStagesByTarget.values()) {
    const variationPercent = calculateVariationPercent(
      confirmationStages.map((stage) => stage.requestsPerSecond)
    );
    const completedAllPasses = confirmationStages.length >= profile.confirmationPasses;
    const confirmed = completedAllPasses
      && confirmationStages.every((stage) => stage.accepted)
      && variationPercent <= profile.maxConfirmationVariationPercent;
    confirmationStages.forEach((stage) => {
      stage.confirmationVariationPercent = roundMetric(variationPercent);
      stage.confirmed = confirmed;
      if (!completedAllPasses) {
        stage.failureReasons = uniqueStrings([
          ...(stage.failureReasons || []),
          `confirmation completed ${confirmationStages.length} of ${profile.confirmationPasses} pass(es)`
        ]);
        stage.accepted = false;
      }
      if (!confirmed && variationPercent > profile.maxConfirmationVariationPercent) {
        stage.failureReasons = uniqueStrings([
          ...(stage.failureReasons || []),
          `confirmation variation ${roundMetric(variationPercent)}% exceeded ${profile.maxConfirmationVariationPercent}%`
        ]);
        stage.accepted = false;
      }
    });
  }
}

function createStageProgressEmitter(onProgress, {
  phase,
  phaseLabel,
  percentStart,
  percentEnd,
  stageIndex,
  stageCount,
  pass,
  passes
}) {
  return (progress = {}) => {
    const phasePercent = Math.max(0, Math.min(100, safeNumber(progress.phasePercent)));
    const stageWeight = stageCount > 0 ? 1 / stageCount : 1;
    const completedStageFraction = stageCount > 0 ? Math.max(0, stageIndex - 1) * stageWeight : 0;
    const phaseFraction = Math.min(1, completedStageFraction + (phasePercent / 100 * stageWeight));
    emitCalibrationProgress(onProgress, {
      ...progress,
      phase,
      phaseLabel,
      percent: percentStart + ((percentEnd - percentStart) * phaseFraction),
      stageIndex,
      stageCount,
      pass,
      passes
    });
  };
}

function emitCalibrationProgress(onProgress, progress = {}) {
  if (typeof onProgress !== 'function') {
    return;
  }
  onProgress({
    kind: 'calibration',
    phase: progress.phase || 'calibration',
    phaseLabel: progress.phaseLabel || 'Calibration',
    message: progress.message || progress.phaseLabel || 'Running calibration...',
    percent: clampPercent(progress.percent),
    phasePercent: clampPercent(progress.phasePercent),
    targetRequestsPerSecond: safeNumber(progress.targetRequestsPerSecond),
    completedRequests: safeNumber(progress.completedRequests),
    totalRequests: safeNumber(progress.totalRequests),
    activeRequests: safeNumber(progress.activeRequests),
    durationMillis: safeNumber(progress.durationMillis),
    stageIndex: safeNumber(progress.stageIndex),
    stageCount: safeNumber(progress.stageCount),
    pass: safeNumber(progress.pass),
    passes: safeNumber(progress.passes)
  });
}

async function runTargetRpsStage({
  name,
  mode,
  targetRequestsPerSecond,
  durationMillis,
  endpoint,
  agent,
  profile,
  signal,
  onProgress
}) {
  const targetRequests = Math.max(1, Math.floor(targetRequestsPerSecond * durationMillis / 1000));
  const maxInFlight = Math.min(
    profile.maxConcurrency,
    Math.max(1, Math.ceil(targetRequestsPerSecond * profile.inFlightWindowMillis / 1000))
  );
  const state = createStageState({ name, mode, concurrency: maxInFlight, targetDurationMillis: durationMillis });
  state.targetRequestsPerSecond = targetRequestsPerSecond;
  state.targetRequests = targetRequests;
  state.requestedRequests = targetRequests;
  state.maxInFlightLimit = maxInFlight;

  const eventLoop = startEventLoopMonitor();
  const startTime = performance.now();
  const endTime = startTime + durationMillis;
  const latencyRecorder = new BoundedRecorder(profile.maxLatencySamples);
  const startLagRecorder = new BoundedRecorder(profile.maxLatencySamples);
  const intervalBuckets = new Map();
  const activePromises = new Set();
  let finalized = false;
  let lastProgressAt = 0;

  const emitStageProgress = (force = false) => {
    if (typeof onProgress !== 'function') {
      return;
    }
    const now = performance.now();
    if (!force && now - lastProgressAt < profile.progressIntervalMillis) {
      return;
    }
    lastProgressAt = now;
    const elapsedMillis = Math.max(0, now - startTime);
    onProgress({
      message: `${name}: ${formatTarget(state.completedRequests)} of ${formatTarget(targetRequests)} requests`,
      phasePercent: Math.min(100, elapsedMillis / durationMillis * 100),
      targetRequestsPerSecond,
      completedRequests: state.completedRequests,
      totalRequests: targetRequests,
      activeRequests: state.activeRequests,
      durationMillis: elapsedMillis
    });
  };

  const launchRequest = () => {
    const index = state.startedRequests + 1;
    const plannedStart = startTime + ((index - 1) * 1000 / targetRequestsPerSecond);
    const started = performance.now();
    startLagRecorder.add(Math.max(0, started - plannedStart));
    state.startedRequests = index;
    state.activeRequests += 1;
    state.maxInFlightRequests = Math.max(state.maxInFlightRequests, state.activeRequests);
    const promise = sendLoopbackRequest(endpoint, agent, profile.requestTimeoutMillis)
      .then((response) => {
        if (finalized) {
          return;
        }
        const completedAt = performance.now();
        state.completedRequests += 1;
        if (response.statusCode < 200 || response.statusCode >= 500) {
          state.failedRequests += 1;
        }
        if (completedAt <= endTime + Math.max(100, profile.schedulerTickMillis * 2)) {
          state.onTimeCompletedRequests += 1;
        }
        latencyRecorder.add(completedAt - started);
        incrementIntervalBucket(intervalBuckets, startTime, completedAt, profile.sampleIntervalMillis);
      })
      .catch(() => {
        if (!finalized) {
          state.failedRequests += 1;
        }
      })
      .finally(() => {
        if (!finalized) {
          state.activeRequests -= 1;
        }
        activePromises.delete(promise);
      });
    activePromises.add(promise);
  };

  emitStageProgress(true);
  while (!signal?.aborted && performance.now() < endTime) {
    const now = performance.now();
    const elapsedMillis = Math.max(0, now - startTime);
    const expectedStarts = Math.min(targetRequests, Math.floor(targetRequestsPerSecond * elapsedMillis / 1000));
    state.maxStartBacklog = Math.max(state.maxStartBacklog, expectedStarts - state.startedRequests);
    while (
      state.startedRequests < expectedStarts
      && state.activeRequests < maxInFlight
      && !signal?.aborted
    ) {
      launchRequest();
    }
    emitStageProgress();
    await sleep(Math.min(profile.schedulerTickMillis, Math.max(1, endTime - performance.now())), signal).catch(() => {});
  }

  if (signal?.aborted) {
    agent.destroy();
  }
  await waitForStageToSettle(state, activePromises, profile.settleTimeoutMillis, agent);
  finalized = true;
  finalizeStage(state, {
    startTime,
    targetDurationMillis: durationMillis,
    targetRequestsPerSecond,
    targetRequests,
    intervalBuckets,
    sampleIntervalMillis: profile.sampleIntervalMillis,
    latencySamples: latencyRecorder.snapshot(),
    startLagSamples: startLagRecorder.snapshot(),
    eventLoop,
    profile,
    cancelled: signal?.aborted === true
  });
  emitStageProgress(true);
  return state;
}

async function runConfiguredStage({ endpoint, agent, profile, signal, configuredStage }) {
  const concurrency = clampInteger(configuredStage.concurrency, 1, profile.maxConcurrency, 1);
  const requestedRequests = Number.isFinite(configuredStage.requests) ? Math.max(0, Math.floor(configuredStage.requests)) : null;
  const targetDurationMillis = Number.isFinite(configuredStage.durationMillis)
    ? Math.max(1, Math.floor(configuredStage.durationMillis))
    : null;
  const mode = requestedRequests != null ? 'fixed' : 'duration';
  const state = createStageState({
    name: configuredStage.name || 'Configured stage',
    mode,
    concurrency,
    targetDurationMillis: targetDurationMillis || 0
  });
  state.requestedRequests = requestedRequests || 0;
  state.targetRequests = requestedRequests || 0;
  state.maxInFlightLimit = concurrency;

  const eventLoop = startEventLoopMonitor();
  const startTime = performance.now();
  const latencyRecorder = new BoundedRecorder(profile.maxLatencySamples);
  const intervalBuckets = new Map();
  const activePromises = new Set();
  let finalized = false;

  const shouldLaunchMore = () => {
    if (signal?.aborted) {
      return false;
    }
    if (requestedRequests != null) {
      return state.startedRequests < requestedRequests;
    }
    return performance.now() - startTime < targetDurationMillis;
  };

  const launchRequest = () => {
    state.startedRequests += 1;
    state.activeRequests += 1;
    state.maxInFlightRequests = Math.max(state.maxInFlightRequests, state.activeRequests);
    const started = performance.now();
    const promise = sendLoopbackRequest(endpoint, agent, profile.requestTimeoutMillis)
      .then((response) => {
        if (finalized) {
          return;
        }
        const completedAt = performance.now();
        state.completedRequests += 1;
        if (response.statusCode < 200 || response.statusCode >= 500) {
          state.failedRequests += 1;
        }
        state.onTimeCompletedRequests += 1;
        latencyRecorder.add(completedAt - started);
        incrementIntervalBucket(intervalBuckets, startTime, completedAt, profile.sampleIntervalMillis);
      })
      .catch(() => {
        if (!finalized) {
          state.failedRequests += 1;
        }
      })
      .finally(() => {
        if (!finalized) {
          state.activeRequests -= 1;
        }
        activePromises.delete(promise);
      });
    activePromises.add(promise);
  };

  while (shouldLaunchMore() || state.activeRequests > 0) {
    while (shouldLaunchMore() && state.activeRequests < concurrency) {
      launchRequest();
    }
    await sleep(profile.schedulerTickMillis, signal).catch(() => {});
    if (signal?.aborted) {
      break;
    }
  }

  if (signal?.aborted) {
    agent.destroy();
  }
  await waitForStageToSettle(state, activePromises, profile.settleTimeoutMillis, agent);
  finalized = true;
  const durationMillis = Math.max(1, performance.now() - startTime);
  finalizeStage(state, {
    startTime,
    targetDurationMillis: targetDurationMillis || durationMillis,
    targetRequestsPerSecond: null,
    targetRequests: requestedRequests || state.startedRequests,
    intervalBuckets,
    sampleIntervalMillis: profile.sampleIntervalMillis,
    latencySamples: latencyRecorder.snapshot(),
    startLagSamples: [],
    eventLoop,
    profile,
    cancelled: signal?.aborted === true
  });
  return state;
}

function createStageState({ name, mode, concurrency, targetDurationMillis }) {
  return {
    name,
    mode,
    concurrency,
    requestedRequests: 0,
    targetRequests: 0,
    targetRequestsPerSecond: 0,
    targetDurationMillis,
    durationMillis: 0,
    startedRequests: 0,
    completedRequests: 0,
    onTimeCompletedRequests: 0,
    failedRequests: 0,
    activeRequests: 0,
    maxInFlightRequests: 0,
    maxInFlightLimit: concurrency,
    maxStartBacklog: 0,
    requestsPerSecond: 0,
    completionRatio: 0,
    achievedTargetRatio: 0,
    errorRate: 0,
    averageLatencyMillis: 0,
    p95LatencyMillis: 0,
    p99LatencyMillis: 0,
    averageStartLagMillis: 0,
    p95StartLagMillis: 0,
    intervalCount: 0,
    medianIntervalRequestsPerSecond: 0,
    minIntervalRequestsPerSecond: 0,
    maxIntervalRequestsPerSecond: 0,
    stabilityPercent: 0,
    eventLoopUtilizationPercent: 0,
    p95EventLoopDelayMillis: 0,
    accepted: false,
    confirmed: false,
    failureReasons: []
  };
}

function finalizeStage(state, {
  startTime,
  targetDurationMillis,
  targetRequestsPerSecond,
  targetRequests,
  intervalBuckets,
  sampleIntervalMillis,
  latencySamples,
  startLagSamples,
  eventLoop,
  profile,
  cancelled
}) {
  const now = performance.now();
  const durationMillis = Math.max(1, now - startTime);
  const accountingDuration = Math.max(1, targetDurationMillis || durationMillis);
  state.durationMillis = roundMetric(durationMillis);
  state.targetDurationMillis = Math.round(targetDurationMillis || durationMillis);
  state.requestsPerSecond = roundMetric(state.completedRequests * 1000 / accountingDuration);
  state.completionRatio = roundMetric(targetRequests > 0 ? state.completedRequests / targetRequests : 1);
  state.achievedTargetRatio = roundMetric(targetRequestsPerSecond ? state.requestsPerSecond / targetRequestsPerSecond : 1);
  state.errorRate = roundMetric(state.startedRequests > 0 ? state.failedRequests / state.startedRequests : 0);
  state.averageLatencyMillis = roundMetric(average(latencySamples));
  state.p95LatencyMillis = roundMetric(percentile(latencySamples, 95));
  state.p99LatencyMillis = roundMetric(percentile(latencySamples, 99));
  state.averageStartLagMillis = roundMetric(average(startLagSamples));
  state.p95StartLagMillis = roundMetric(percentile(startLagSamples, 95));

  const intervalRates = buildIntervalRates(intervalBuckets, accountingDuration, sampleIntervalMillis);
  state.intervalCount = intervalRates.length;
  state.medianIntervalRequestsPerSecond = roundMetric(percentile(intervalRates, 50));
  state.minIntervalRequestsPerSecond = roundMetric(intervalRates.length ? Math.min(...intervalRates) : 0);
  state.maxIntervalRequestsPerSecond = roundMetric(intervalRates.length ? Math.max(...intervalRates) : 0);
  state.stabilityPercent = roundMetric(calculateStabilityPercent(intervalRates));

  const eventLoopStats = finishEventLoopMonitor(eventLoop);
  state.eventLoopUtilizationPercent = eventLoopStats.eventLoopUtilizationPercent;
  state.p95EventLoopDelayMillis = eventLoopStats.p95EventLoopDelayMillis;

  if (cancelled) {
    state.accepted = false;
    state.failureReasons = ['calibration was cancelled'];
    delete state.activeRequests;
    return;
  }
  state.failureReasons = evaluateStageAcceptance(state, profile, targetRequestsPerSecond, sampleIntervalMillis);
  state.accepted = state.failureReasons.length === 0;
  delete state.activeRequests;
}

function evaluateStageAcceptance(stage, profile, targetRequestsPerSecond, sampleIntervalMillis) {
  if (!targetRequestsPerSecond) {
    return stage.failedRequests === 0 ? [] : [`${stage.failedRequests} request(s) failed`];
  }
  const reasons = [];
  if (stage.completionRatio < profile.minCompletionRatio) {
    reasons.push(`completed ${roundMetric(stage.completionRatio * 100)}% of target requests`);
  }
  if (stage.achievedTargetRatio < profile.minCompletionRatio) {
    reasons.push(`achieved ${roundMetric(stage.achievedTargetRatio * 100)}% of target RPS`);
  }
  if (stage.errorRate > profile.maxErrorRate) {
    reasons.push(`error rate ${roundMetric(stage.errorRate * 100)}% exceeded ${roundMetric(profile.maxErrorRate * 100)}%`);
  }
  if (stage.p95StartLagMillis > profile.maxP95StartLagMillis) {
    reasons.push(`p95 scheduler lag ${stage.p95StartLagMillis} ms exceeded ${profile.maxP95StartLagMillis} ms`);
  }
  if (stage.p95EventLoopDelayMillis > profile.maxP95EventLoopDelayMillis) {
    reasons.push(`p95 event-loop delay ${stage.p95EventLoopDelayMillis} ms exceeded ${profile.maxP95EventLoopDelayMillis} ms`);
  }
  const expectedPerInterval = targetRequestsPerSecond * sampleIntervalMillis / 1000;
  if (
    stage.intervalCount >= 4
    && expectedPerInterval >= 5
    && stage.minIntervalRequestsPerSecond / targetRequestsPerSecond < profile.minIntervalRatio
  ) {
    reasons.push(`slowest interval hit ${roundMetric(stage.minIntervalRequestsPerSecond / targetRequestsPerSecond * 100)}% of target RPS`);
  }
  return reasons;
}

function summarizeCalibrationStages(stages = [], { profile = DEFAULT_CALIBRATION_PROFILE } = {}) {
  const normalizedProfile = normalizeProfile(profile);
  const completedRequests = stages.reduce((sum, stage) => sum + safeNumber(stage.completedRequests), 0);
  const failedRequests = stages.reduce((sum, stage) => sum + safeNumber(stage.failedRequests), 0);
  const peakStage = stages.reduce((best, stage) => {
    if (!best || safeNumber(stage.requestsPerSecond) > safeNumber(best.requestsPerSecond)) {
      return stage;
    }
    return best;
  }, null);
  const confirmationStages = stages.filter((stage) => stage.mode === 'confirmation');
  const confirmationGroups = groupConfirmationStages(confirmationStages, normalizedProfile);
  const selectedGroup = selectHighestContiguousConfirmationGroup(confirmationGroups, normalizedProfile);
  const selectedConfirmationStages = selectedGroup?.stages || [];
  const fallbackAcceptedStages = confirmationGroups.length > 0
    ? stages.filter((stage) => stage.mode !== 'confirmation' && stage.accepted)
    : stages.filter((stage) => stage.accepted);
  const reliableStage = selectedConfirmationStages.length > 0
    ? selectedConfirmationStages.reduce((lowest, stage) => (
      !lowest || safeNumber(stage.requestsPerSecond) < safeNumber(lowest.requestsPerSecond) ? stage : lowest
    ), null)
    : (fallbackAcceptedStages.reduce((best, stage) => (
      !best || safeNumber(stage.requestsPerSecond) > safeNumber(best.requestsPerSecond) ? stage : best
    ), null) || peakStage);
  const confirmationRates = selectedConfirmationStages.map((stage) => safeNumber(stage.requestsPerSecond)).filter((value) => value > 0);
  const variationPercent = calculateVariationPercent(confirmationRates);
  const sustainedRequestsPerSecond = confirmationRates.length
    ? Math.min(...confirmationRates)
    : safeNumber(reliableStage?.requestsPerSecond);
  const reliableTargetRequestsPerSecond = selectedGroup
    ? selectedGroup.targetRequestsPerSecond
    : safeNumber(reliableStage?.targetRequestsPerSecond || reliableStage?.requestsPerSecond);
  const recommendedMaxRequestsPerSecond = Math.floor(Math.max(0, sustainedRequestsPerSecond * normalizedProfile.safetyMargin));
  const edgeUpperBoundRequestsPerSecond = selectedGroup
    ? (lowestRejectedConfirmationTargetAbove(confirmationGroups, selectedGroup.targetRequestsPerSecond, normalizedProfile)
      || lowestFailedTargetAbove(stages, selectedGroup.targetRequestsPerSecond))
    : 0;
  const p95LatencyMillis = selectedConfirmationStages.length
    ? Math.max(...selectedConfirmationStages.map((stage) => safeNumber(stage.p95LatencyMillis)))
    : safeNumber(peakStage?.p95LatencyMillis);
  const p95StartLagMillis = selectedConfirmationStages.length
    ? Math.max(...selectedConfirmationStages.map((stage) => safeNumber(stage.p95StartLagMillis)))
    : safeNumber(reliableStage?.p95StartLagMillis);
  const p95EventLoopDelayMillis = selectedConfirmationStages.length
    ? Math.max(...selectedConfirmationStages.map((stage) => safeNumber(stage.p95EventLoopDelayMillis)))
    : safeNumber(reliableStage?.p95EventLoopDelayMillis);
  const repeatabilityPercent = Math.max(0, 100 - variationPercent);
  const confidence = confidenceForSummary(selectedConfirmationStages, normalizedProfile, variationPercent);

  return {
    peakRequestsPerSecond: roundMetric(safeNumber(peakStage?.requestsPerSecond)),
    peakConcurrency: safeNumber(peakStage?.maxInFlightRequests || peakStage?.concurrency),
    sustainedRequestsPerSecond: roundMetric(sustainedRequestsPerSecond),
    reliableTargetRequestsPerSecond: roundMetric(reliableTargetRequestsPerSecond),
    edgeUpperBoundRequestsPerSecond: roundMetric(edgeUpperBoundRequestsPerSecond),
    measurementVariationPercent: roundMetric(variationPercent),
    confirmationTargetsTested: confirmationGroups.length,
    recommendedMaxRequestsPerSecond,
    saturationConcurrency: safeNumber(reliableStage?.maxInFlightRequests || reliableStage?.concurrency),
    stabilityPercent: roundMetric(selectedConfirmationStages.length
      ? average(selectedConfirmationStages.map((stage) => safeNumber(stage.stabilityPercent)))
      : safeNumber(peakStage?.stabilityPercent)),
    repeatabilityPercent: roundMetric(repeatabilityPercent),
    confidence,
    averageLatencyMillis: roundMetric(stages.length
      ? average(stages.map((stage) => safeNumber(stage.averageLatencyMillis)).filter((value) => value > 0))
      : 0),
    p95LatencyMillis: roundMetric(p95LatencyMillis),
    p95StartLagMillis: roundMetric(p95StartLagMillis),
    p95EventLoopDelayMillis: roundMetric(p95EventLoopDelayMillis),
    completedRequests,
    failedRequests,
    confirmationPasses: selectedConfirmationStages.length,
    notes: buildSummaryNotes({
      confidence,
      recommendedMaxRequestsPerSecond,
      selectedConfirmationStages,
      reliableTargetRequestsPerSecond,
      edgeUpperBoundRequestsPerSecond
    })
  };
}

function groupConfirmationStages(confirmationStages = [], profile) {
  const groups = new Map();
  for (const stage of confirmationStages) {
    const targetRequestsPerSecond = safeNumber(stage.confirmationTargetRequestsPerSecond || stage.targetRequestsPerSecond);
    if (targetRequestsPerSecond <= 0) {
      continue;
    }
    if (!groups.has(targetRequestsPerSecond)) {
      groups.set(targetRequestsPerSecond, {
        targetRequestsPerSecond,
        stages: []
      });
    }
    groups.get(targetRequestsPerSecond).stages.push(stage);
  }
  return [...groups.values()].map((group) => {
    const rates = group.stages.map((stage) => safeNumber(stage.requestsPerSecond)).filter((value) => value > 0);
    const variationPercent = calculateVariationPercent(rates);
    const p95LatencyMillis = group.stages.length
      ? Math.max(...group.stages.map((stage) => safeNumber(stage.p95LatencyMillis)))
      : 0;
    return {
      ...group,
      variationPercent,
      p95LatencyMillis,
      confirmed: group.stages.length >= profile.confirmationPasses
        && group.stages.every((stage) => stage.confirmed === true)
        && variationPercent <= profile.maxConfirmationVariationPercent,
      accepted: group.stages.length > 0
        && group.stages.every((stage) => stage.accepted === true)
        && variationPercent <= profile.maxConfirmationVariationPercent
    };
  });
}

function selectHighestContiguousConfirmationGroup(groups = [], profile = DEFAULT_CALIBRATION_PROFILE) {
  const sortedGroups = groups
    .slice()
    .sort((left, right) => left.targetRequestsPerSecond - right.targetRequestsPerSecond);
  let selected = null;
  let baselineLatencyMillis = 0;
  for (const group of sortedGroups) {
    if (!group.confirmed) {
      break;
    }
    if (!confirmationGroupStaysWithinLatencyEnvelope(group, baselineLatencyMillis, profile)) {
      break;
    }
    selected = group;
    if (group.p95LatencyMillis > 0 && (baselineLatencyMillis <= 0 || group.p95LatencyMillis < baselineLatencyMillis)) {
      baselineLatencyMillis = group.p95LatencyMillis;
    }
  }
  return selected;
}

function lowestRejectedConfirmationTargetAbove(groups = [], targetRequestsPerSecond, profile = DEFAULT_CALIBRATION_PROFILE) {
  const sortedGroups = groups
    .slice()
    .sort((left, right) => left.targetRequestsPerSecond - right.targetRequestsPerSecond);
  let baselineLatencyMillis = 0;
  for (const group of sortedGroups) {
    if (group.targetRequestsPerSecond <= targetRequestsPerSecond) {
      if (group.confirmed && group.p95LatencyMillis > 0 && (baselineLatencyMillis <= 0 || group.p95LatencyMillis < baselineLatencyMillis)) {
        baselineLatencyMillis = group.p95LatencyMillis;
      }
      continue;
    }
    if (!group.confirmed || !confirmationGroupStaysWithinLatencyEnvelope(group, baselineLatencyMillis, profile)) {
      return group.targetRequestsPerSecond;
    }
  }
  return 0;
}

function confirmationGroupStaysWithinLatencyEnvelope(group, baselineLatencyMillis, profile) {
  if (!group.confirmed || baselineLatencyMillis <= 0 || safeNumber(group.p95LatencyMillis) <= 0) {
    return group.confirmed === true;
  }
  const multiplierLimit = baselineLatencyMillis * profile.maxConfirmationLatencyGrowthMultiplier;
  const deltaLimit = baselineLatencyMillis + profile.maxConfirmationLatencyGrowthMillis;
  return group.p95LatencyMillis <= multiplierLimit || group.p95LatencyMillis <= deltaLimit;
}

function lowestFailedTargetAbove(stages = [], targetRequestsPerSecond) {
  const failedTargets = stages
    .map((stage) => ({
      target: safeNumber(stage.confirmationTargetRequestsPerSecond || stage.targetRequestsPerSecond),
      accepted: stage.mode === 'confirmation' ? stage.confirmed === true : stage.accepted === true
    }))
    .filter((stage) => stage.target > targetRequestsPerSecond && !stage.accepted)
    .map((stage) => stage.target);
  return failedTargets.length ? Math.min(...failedTargets) : 0;
}

function confidenceForSummary(selectedConfirmationStages, profile, variationPercent) {
  if (selectedConfirmationStages.length >= profile.confirmationPasses && variationPercent <= profile.maxConfirmationVariationPercent) {
    return 'high';
  }
  if (selectedConfirmationStages.length > 0) {
    return 'medium';
  }
  return 'low';
}

function buildSummaryNotes({
  confidence,
  recommendedMaxRequestsPerSecond,
  selectedConfirmationStages,
  reliableTargetRequestsPerSecond,
  edgeUpperBoundRequestsPerSecond
}) {
  const notes = [
    'Loopback calibration estimates this machine and PostMeter runtime overhead only.',
    'External APIs, TLS, DNS, proxies, network limits, and server behavior can lower achievable RPS.'
  ];
  if (recommendedMaxRequestsPerSecond > 0) {
    notes.push(`PostMeter confirmed this machine can sustain ${reliableTargetRequestsPerSecond} RPS locally; ${recommendedMaxRequestsPerSecond} RPS is a conservative planning cap for judging whether a target may be client-limited.`);
  }
  if (edgeUpperBoundRequestsPerSecond > reliableTargetRequestsPerSecond) {
    notes.push(`The next tested candidate, ${edgeUpperBoundRequestsPerSecond} RPS, did not satisfy the repeatability criteria.`);
  }
  if (confidence !== 'high') {
    notes.push('The cap was not confirmed across all repeatability passes; treat it as a lower-confidence estimate.');
  }
  if (selectedConfirmationStages.length > 0) {
    notes.push('The reported cap is based on repeated target-rate confirmation, not a best-effort peak burst.');
  }
  return notes;
}

async function startCalibrationServer(options = {}) {
  if (options.useWorkerServer !== false) {
    try {
      return await startWorkerCalibrationServer(options);
    } catch (_error) {
      return startInProcessCalibrationServer(options);
    }
  }
  return startInProcessCalibrationServer(options);
}

function startWorkerCalibrationServer(options = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'performanceCalibrationServerWorker.js'), {
      workerData: {
        responseDelayMillis: options.responseDelayMillis || 0
      }
    });
    let settled = false;
    const fail = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      worker.terminate().catch(() => {});
      reject(error);
    };
    worker.once('error', fail);
    worker.once('exit', (code) => {
      if (!settled && code !== 0) {
        fail(new Error(`Calibration worker exited with code ${code}.`));
      }
    });
    worker.on('message', (message) => {
      if (message?.type === 'error') {
        fail(new Error(message.message || 'Calibration worker failed.'));
        return;
      }
      if (message?.type !== 'listening') {
        return;
      }
      if (!Number.isInteger(message.port)) {
        fail(new Error('Calibration worker did not return a port.'));
        return;
      }
      settled = true;
      resolve({
        endpoint: `http://127.0.0.1:${message.port}/calibration`,
        close: () => closeWorker(worker)
      });
    });
  });
}

function closeWorker(worker) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) {
        return;
      }
      done = true;
      resolve();
    };
    const timer = setTimeout(() => {
      worker.terminate().catch(() => {}).finally(finish);
    }, 1000);
    worker.once('message', (message) => {
      if (message?.type === 'closed') {
        clearTimeout(timer);
        finish();
      }
    });
    worker.once('exit', () => {
      clearTimeout(timer);
      finish();
    });
    worker.postMessage({ type: 'close' });
  });
}

function startInProcessCalibrationServer(options = {}) {
  const responseDelayMillis = Math.max(0, Number(options.responseDelayMillis || 0));
  const server = http.createServer((_request, response) => {
    const send = () => {
      response.writeHead(204, {
        'Content-Length': '0',
        Connection: 'keep-alive'
      });
      response.end();
    };
    if (responseDelayMillis > 0) {
      setTimeout(send, responseDelayMillis);
      return;
    }
    send();
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        endpoint: `http://127.0.0.1:${address.port}/calibration`,
        close: () => new Promise((closeResolve) => server.close(() => closeResolve()))
      });
    });
  });
}

function sendLoopbackRequest(endpoint, agent, timeoutMillis) {
  return new Promise((resolve, reject) => {
    const request = http.request(endpoint, { method: 'GET', agent, timeout: timeoutMillis }, (response) => {
      response.resume();
      response.on('end', () => resolve({ statusCode: response.statusCode || 0 }));
    });
    request.on('timeout', () => {
      request.destroy(new Error('request timed out'));
    });
    request.on('error', reject);
    request.end();
  });
}

function startEventLoopMonitor() {
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  return {
    histogram,
    utilization: performance.eventLoopUtilization()
  };
}

function finishEventLoopMonitor(eventLoop) {
  eventLoop.histogram.disable();
  const utilization = performance.eventLoopUtilization(eventLoop.utilization);
  const p95Nanoseconds = eventLoop.histogram.percentile(95);
  return {
    eventLoopUtilizationPercent: roundMetric((utilization.utilization || 0) * 100),
    p95EventLoopDelayMillis: roundMetric(Number.isFinite(p95Nanoseconds) ? p95Nanoseconds / 1e6 : 0)
  };
}

async function waitForStageToSettle(state, activePromises, settleTimeoutMillis, agent) {
  const deadline = performance.now() + settleTimeoutMillis;
  while (activePromises.size > 0 && performance.now() < deadline) {
    await sleep(5).catch(() => {});
  }
  if (activePromises.size > 0) {
    agent?.destroy();
    await Promise.race([
      Promise.allSettled([...activePromises]),
      sleep(250)
    ]).catch(() => {});
  }
}

function incrementIntervalBucket(intervalBuckets, startTime, completedAt, sampleIntervalMillis) {
  const index = Math.max(0, Math.floor((completedAt - startTime) / sampleIntervalMillis));
  intervalBuckets.set(index, (intervalBuckets.get(index) || 0) + 1);
}

function buildIntervalRates(intervalBuckets, durationMillis, sampleIntervalMillis) {
  const intervalCount = Math.max(1, Math.ceil(durationMillis / sampleIntervalMillis));
  const rates = [];
  for (let index = 0; index < intervalCount; index += 1) {
    rates.push((intervalBuckets.get(index) || 0) * 1000 / sampleIntervalMillis);
  }
  if (rates.length > 4) {
    return rates.slice(1, -1);
  }
  return rates;
}

function calculateStabilityPercent(rates = []) {
  const nonZeroRates = rates.filter((rate) => rate > 0);
  if (nonZeroRates.length === 0) {
    return 0;
  }
  const mean = average(nonZeroRates);
  if (mean <= 0) {
    return 0;
  }
  const variance = nonZeroRates.reduce((sum, rate) => sum + ((rate - mean) ** 2), 0) / nonZeroRates.length;
  return Math.max(0, 100 - (Math.sqrt(variance) / mean * 100));
}

function calculateVariationPercent(values = []) {
  const finiteValues = values.filter((value) => Number.isFinite(value) && value > 0);
  if (finiteValues.length <= 1) {
    return 0;
  }
  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  const midpoint = (min + max) / 2;
  return midpoint > 0 ? (max - min) / midpoint * 100 : 0;
}

function normalizeProfile(profile = {}) {
  const targetRates = Array.isArray(profile.targetRates) && profile.targetRates.length > 0
    ? profile.targetRates
    : DEFAULT_CALIBRATION_PROFILE.targetRates;
  const normalizedTargetRates = uniqueNumbers(targetRates).filter((value) => value > 0).sort((a, b) => a - b);
  return {
    warmupTargetRequestsPerSecond: positiveNumber(profile.warmupTargetRequestsPerSecond, DEFAULT_CALIBRATION_PROFILE.warmupTargetRequestsPerSecond),
    warmupDurationMillis: positiveNumber(profile.warmupDurationMillis, DEFAULT_CALIBRATION_PROFILE.warmupDurationMillis),
    probeDurationMillis: positiveNumber(profile.probeDurationMillis ?? profile.stageDurationMillis, DEFAULT_CALIBRATION_PROFILE.probeDurationMillis),
    confirmationDurationMillis: positiveNumber(profile.confirmationDurationMillis, DEFAULT_CALIBRATION_PROFILE.confirmationDurationMillis),
    confirmationPasses: clampInteger(profile.confirmationPasses, 1, 10, DEFAULT_CALIBRATION_PROFILE.confirmationPasses),
    targetRates: normalizedTargetRates.length > 0 ? normalizedTargetRates : DEFAULT_CALIBRATION_PROFILE.targetRates.slice(),
    sampleIntervalMillis: positiveNumber(profile.sampleIntervalMillis, DEFAULT_CALIBRATION_PROFILE.sampleIntervalMillis),
    progressIntervalMillis: positiveNumber(profile.progressIntervalMillis, DEFAULT_CALIBRATION_PROFILE.progressIntervalMillis),
    schedulerTickMillis: positiveNumber(profile.schedulerTickMillis, DEFAULT_CALIBRATION_PROFILE.schedulerTickMillis),
    maxLatencySamples: clampInteger(profile.maxLatencySamples, 100, 1000000, DEFAULT_CALIBRATION_PROFILE.maxLatencySamples),
    maxConcurrency: clampInteger(profile.maxConcurrency, 1, 65535, DEFAULT_CALIBRATION_PROFILE.maxConcurrency),
    inFlightWindowMillis: positiveNumber(profile.inFlightWindowMillis, DEFAULT_CALIBRATION_PROFILE.inFlightWindowMillis),
    settleTimeoutMillis: positiveNumber(profile.settleTimeoutMillis, DEFAULT_CALIBRATION_PROFILE.settleTimeoutMillis),
    requestTimeoutMillis: positiveNumber(profile.requestTimeoutMillis, DEFAULT_CALIBRATION_PROFILE.requestTimeoutMillis),
    minCompletionRatio: ratio(profile.minCompletionRatio, DEFAULT_CALIBRATION_PROFILE.minCompletionRatio),
    minIntervalRatio: ratio(profile.minIntervalRatio, DEFAULT_CALIBRATION_PROFILE.minIntervalRatio),
    maxErrorRate: ratio(profile.maxErrorRate, DEFAULT_CALIBRATION_PROFILE.maxErrorRate),
    maxP95StartLagMillis: positiveNumber(profile.maxP95StartLagMillis, DEFAULT_CALIBRATION_PROFILE.maxP95StartLagMillis),
    maxP95EventLoopDelayMillis: positiveNumber(profile.maxP95EventLoopDelayMillis, DEFAULT_CALIBRATION_PROFILE.maxP95EventLoopDelayMillis),
    maxConfirmationVariationPercent: positiveNumber(profile.maxConfirmationVariationPercent, DEFAULT_CALIBRATION_PROFILE.maxConfirmationVariationPercent),
    maxConfirmationLatencyGrowthMultiplier: positiveNumber(profile.maxConfirmationLatencyGrowthMultiplier, DEFAULT_CALIBRATION_PROFILE.maxConfirmationLatencyGrowthMultiplier),
    maxConfirmationLatencyGrowthMillis: positiveNumber(profile.maxConfirmationLatencyGrowthMillis, DEFAULT_CALIBRATION_PROFILE.maxConfirmationLatencyGrowthMillis),
    maxConfirmationCandidates: clampInteger(profile.maxConfirmationCandidates, 1, 32, DEFAULT_CALIBRATION_PROFILE.maxConfirmationCandidates),
    probeFailureStopCount: clampInteger(profile.probeFailureStopCount, 1, 16, DEFAULT_CALIBRATION_PROFILE.probeFailureStopCount),
    maxCalibrationDurationMillis: positiveNumber(profile.maxCalibrationDurationMillis, DEFAULT_CALIBRATION_PROFILE.maxCalibrationDurationMillis),
    minCalibrationStageDurationMillis: positiveNumber(profile.minCalibrationStageDurationMillis, DEFAULT_CALIBRATION_PROFILE.minCalibrationStageDurationMillis),
    safetyMargin: ratio(profile.safetyMargin, DEFAULT_CALIBRATION_PROFILE.safetyMargin)
  };
}

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function ratio(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function clampInteger(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function uniqueNumbers(values) {
  return [...new Set(values.map((value) => Number(value)).filter(Number.isFinite))];
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))];
}

function safeNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function clampPercent(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, roundMetric(value)));
}

function average(values = []) {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) {
    return 0;
  }
  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

function percentile(values = [], p) {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) {
    return 0;
  }
  const sorted = finiteValues.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function roundMetric(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 100) / 100;
}

function formatTarget(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw abortError();
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    let settled = false;
    let timer = null;
    let onAbort = null;
    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (onAbort) {
        signal?.removeEventListener('abort', onAbort);
      }
      callback(value);
    };
    timer = setTimeout(() => finish(resolve), Math.max(0, ms));
    if (signal) {
      onAbort = () => {
        clearTimeout(timer);
        finish(reject, abortError());
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

function abortError() {
  const error = new Error('Performance calibration cancelled.');
  error.name = 'AbortError';
  return error;
}

function isAbortError(error) {
  return error?.name === 'AbortError' || /cancelled|aborted/i.test(error?.message || '');
}

module.exports = {
  runPerformanceCalibration,
  summarizeCalibrationStages
};
