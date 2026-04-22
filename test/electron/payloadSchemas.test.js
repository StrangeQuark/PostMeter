const assert = require('node:assert/strict');
const test = require('node:test');
const {
  AUTH_TYPE_VALUES,
  BODY_TYPE_VALUES,
  ASSERTION_OPERATORS,
  ASSERTION_TYPES,
  COLLECTION_EXPORT_FORMATS,
  HTTP_METHODS,
  PAYLOAD_SCHEMA_VERSION,
  oneOf,
  payloadSchemas
} = require('../../src/core/payloadSchemas');

test('defines shared payload schema metadata for IPC and contributors', () => {
  assert.equal(PAYLOAD_SCHEMA_VERSION, 1);
  assert.ok(COLLECTION_EXPORT_FORMATS.includes('openapi'));
  assert.ok(COLLECTION_EXPORT_FORMATS.includes('jmeter'));
  assert.ok(HTTP_METHODS.includes('PATCH'));
  assert.ok(BODY_TYPE_VALUES.includes('RAW_JSON'));
  assert.ok(AUTH_TYPE_VALUES.includes('oauth2'));
  assert.ok(ASSERTION_TYPES.includes('jsonPath'));
  assert.ok(ASSERTION_TYPES.includes('xmlPath'));
  assert.ok(ASSERTION_TYPES.includes('htmlSelector'));
  assert.ok(ASSERTION_TYPES.includes('extractXml'));
  assert.ok(ASSERTION_TYPES.includes('extractHtml'));
  assert.ok(ASSERTION_OPERATORS.includes('lessThan'));
  assert.equal(payloadSchemas.fields.keyValue.value.limit, 'value');
  assert.equal(payloadSchemas.fields.cookie.sameSite.enum, 'sameSiteValues');
  assert.equal(payloadSchemas.fields.cookie.priority.enum, 'cookiePriorities');
  assert.equal(payloadSchemas.fields.cookie.source.limit, 'short');
  assert.equal(payloadSchemas.fields.assertion.type.enum, 'assertionTypes');
  assert.equal(payloadSchemas.fields.auth.type.enum, 'authTypes');
  assert.equal(payloadSchemas.fields.auth.location.enum, 'apiKeyLocations');
  assert.equal(payloadSchemas.fields.auth.grantType.enum, 'oauth2GrantTypes');
  assert.equal(payloadSchemas.fields.scripts.tests.limit, 'body');
  assert.equal(payloadSchemas.fields.loadConfig.concurrency.type, 'number');
  assert.equal(payloadSchemas.fields.loadConfig.executionMode.enum, 'loadExecutionModes');
  assert.equal(payloadSchemas.fields.loadResult.targetRatePerSecond.type, 'number');
  assert.equal(payloadSchemas.fields.loadHistogramBucket.count.type, 'number');
  assert.equal(payloadSchemas.fields.loadSample.success.type, 'boolean');
  assert.equal(payloadSchemas.fields.scriptRunResult.error.limit, 'value');
  assert.equal(payloadSchemas.fields.scriptTestResult.name.limit, 'name');
  assert.equal(payloadSchemas.fields.updateCheckOptions.includePrereleases.type, 'boolean');
  assert.equal(payloadSchemas.fields.externalUrl.url.limit, 'url');
  assert.equal(payloadSchemas.fields.response.finalUrl.limit, 'url');
  assert.equal(payloadSchemas.fields.collectionRunRequestResult.error.limit, 'value');
  assert.equal(payloadSchemas.entities.request.nested[0], 'auth');
  assert.equal(payloadSchemas.auth.oauth2GrantTypes[0], 'authorizationCode');
  assert.deepEqual(payloadSchemas.load.executionModes, ['singleProcess', 'multiProcess']);
});

test('validates enum values through shared schema helper', () => {
  assert.equal(oneOf('har', COLLECTION_EXPORT_FORMATS, 'format'), 'har');
  assert.throws(() => oneOf('bad', COLLECTION_EXPORT_FORMATS, 'format'), /must be one of/);
});
