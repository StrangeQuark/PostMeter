const assert = require('node:assert/strict');
const test = require('node:test');
const {
  boundedInteger,
  boundedNumber,
  defaultLoadPolicy,
  defaultRequestLoadPolicy,
  normalizeLoadPolicy
} = require('../../src/renderer/loadPolicy');

test('renderer load policy normalizes values within supported bounds', () => {
  const policy = normalizeLoadPolicy({
    concurrency: '999',
    totalRequests: '0',
    durationSeconds: '12.5',
    rampUpSeconds: '-2',
    targetRatePerSecond: '30000',
    maxRatePerSecond: '7.5',
    executionMode: 'multiProcess',
    workerProcesses: '20',
    recordSamples: true
  });

  assert.equal(policy.concurrency, 512);
  assert.equal(policy.totalRequests, 1);
  assert.equal(policy.durationSeconds, 12.5);
  assert.equal(policy.rampUpSeconds, 0);
  assert.equal(policy.targetRatePerSecond, 10000);
  assert.equal(policy.maxRatePerSecond, 7.5);
  assert.equal(policy.executionMode, 'multiProcess');
  assert.equal(policy.workerProcesses, 8);
  assert.equal(policy.recordSamples, true);
});

test('renderer load policy exposes default request policy and bounded helpers', () => {
  assert.equal(defaultLoadPolicy().concurrency, 5);
  assert.equal(defaultRequestLoadPolicy().enabled, false);
  assert.equal(boundedInteger('nope', 3, 1, 10), 3);
  assert.equal(boundedNumber('nope', 4.5, 0, 10), 4.5);
});
