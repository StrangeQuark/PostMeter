const assert = require('node:assert/strict');
const test = require('node:test');
const {
  applyAssertionTypeDefaults,
  assertionExpectedPlaceholder,
  assertionNamePlaceholder,
  assertionPathPlaceholder,
  assertionTemplates,
  newAssertion
} = require('../../src/renderer/assertionModel');

test('renderer assertion model exposes the PostMeter assertion templates', () => {
  assert.equal(assertionTemplates.status200.expected, '200');
  assert.equal(assertionTemplates.extractRegex.variableName, 'token');
});

test('renderer assertion model applies type defaults in place', () => {
  const assertion = {
    type: 'extractHtml',
    operator: 'equals',
    expected: 'old',
    name: 'before',
    path: 'before',
    variableName: 'before'
  };
  applyAssertionTypeDefaults(assertion);
  assert.deepEqual(assertion, {
    type: 'extractHtml',
    operator: 'exists',
    expected: '',
    name: 'title',
    path: 'title',
    variableName: 'title'
  });
});

test('renderer assertion model derives placeholders by assertion type', () => {
  assert.equal(assertionNamePlaceholder({ type: 'header' }), 'Header name');
  assert.equal(assertionNamePlaceholder({ type: 'extractRegex' }), 'Variable name');
  assert.equal(assertionPathPlaceholder({ type: 'jsonPath' }), 'JSON path');
  assert.equal(assertionPathPlaceholder({ type: 'extractHtml' }), 'CSS selector');
  assert.equal(assertionPathPlaceholder({ type: 'extractRegex' }), 'Unused');
  assert.equal(assertionExpectedPlaceholder({ type: 'responseTime' }), 'Milliseconds');
  assert.equal(assertionExpectedPlaceholder({ type: 'htmlSelector' }), 'Expected text');
});

test('renderer assertion model creates new enabled assertions from templates', () => {
  assert.deepEqual(newAssertion(assertionTemplates.headerContains), {
    enabled: true,
    type: 'header',
    operator: 'contains',
    expected: 'application/json',
    name: 'Content-Type',
    path: '',
    variableName: ''
  });
});
