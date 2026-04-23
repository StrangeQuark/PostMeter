const assert = require('node:assert/strict');
const test = require('node:test');
const {
  boundedInteger,
  boundedNumber,
  defaultLoadPolicy,
  defaultRequestLoadPolicy,
  normalizeLoadPolicy,
  normalizeRequestLoadPolicy
} = require('../../src/core/loadPolicyModel');

test('shared load policy model exposes stable defaults and bounds', () => {
  assert.deepEqual(defaultLoadPolicy(), {
    concurrency: 5,
    totalRequests: 25,
    durationSeconds: 0,
    rampUpSeconds: 0,
    targetRatePerSecond: 0,
    maxRatePerSecond: 0,
    executionMode: 'singleProcess',
    workerProcesses: 2,
    recordSamples: false
  });
  assert.equal(defaultRequestLoadPolicy().enabled, false);
  assert.equal(boundedInteger('oops', 3, 1, 10), 3);
  assert.equal(boundedNumber('oops', 4.5, 0, 10), 4.5);
});

test('shared load policy model normalizes request policies consistently', () => {
  assert.deepEqual(normalizeLoadPolicy({
    concurrency: '999',
    totalRequests: '0',
    durationSeconds: '12.5',
    rampUpSeconds: '-1',
    targetRatePerSecond: '15000',
    maxRatePerSecond: '7.5',
    executionMode: 'multiProcess',
    workerProcesses: '42',
    recordSamples: true
  }), {
    concurrency: 512,
    totalRequests: 1,
    durationSeconds: 12.5,
    rampUpSeconds: 0,
    targetRatePerSecond: 10000,
    maxRatePerSecond: 7.5,
    executionMode: 'multiProcess',
    workerProcesses: 8,
    recordSamples: true
  });

  assert.deepEqual(normalizeRequestLoadPolicy({
    enabled: true,
    concurrency: '2'
  }), {
    enabled: true,
    concurrency: 2,
    totalRequests: 25,
    durationSeconds: 0,
    rampUpSeconds: 0,
    targetRatePerSecond: 0,
    maxRatePerSecond: 0,
    executionMode: 'singleProcess',
    workerProcesses: 2,
    recordSamples: false
  });
});
