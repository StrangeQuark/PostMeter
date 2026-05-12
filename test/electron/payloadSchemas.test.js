const assert = require('node:assert/strict');
const test = require('node:test');
const {
  AUTH_TYPE_VALUES,
  BODY_TYPE_VALUES,
  COLLECTION_EXPORT_FORMATS,
  fieldLimit,
  hasSchemaEnumValue,
  HTTP_METHODS,
  normalizeSchemaEnumValue,
  PAYLOAD_SCHEMA_VERSION,
  oneOf,
  payloadSchemas,
  schemaEnum
} = require('../../src/core/payloadSchemas');

test('defines shared payload schema metadata for IPC and contributors', () => {
  assert.equal(PAYLOAD_SCHEMA_VERSION, 1);
  assert.deepEqual(COLLECTION_EXPORT_FORMATS, ['postmeter', 'postman', 'openapi', 'curl']);
  assert.ok(HTTP_METHODS.includes('PATCH'));
  assert.ok(BODY_TYPE_VALUES.includes('RAW_JSON'));
  assert.ok(AUTH_TYPE_VALUES.includes('oauth2'));
  assert.equal(payloadSchemas.fields.keyValue.value.limit, 'value');
  assert.equal(payloadSchemas.fields.appearance.theme.enum, 'themeValues');
  assert.equal(payloadSchemas.fields.editorSettings.lineNumbers.type, 'boolean');
  assert.equal(payloadSchemas.fields.diagnosticsLogging.level.enum, 'diagnosticLogLevels');
  assert.equal(payloadSchemas.fields.requestResponseLoggingSettings.bodies.type, 'boolean');
  assert.equal(payloadSchemas.fields.cookie.sameSite.enum, 'sameSiteValues');
  assert.equal(payloadSchemas.fields.cookie.priority.enum, 'cookiePriorities');
  assert.equal(payloadSchemas.fields.cookie.source.limit, 'short');
  assert.equal(payloadSchemas.fields.auth.type.enum, 'authTypes');
  assert.equal(payloadSchemas.fields.auth.location.enum, 'apiKeyLocations');
  assert.equal(payloadSchemas.fields.auth.grantType.enum, 'oauth2GrantTypes');
  assert.equal(payloadSchemas.fields.scripts.tests.limit, 'body');
  assert.equal(payloadSchemas.fields.scriptRunResult.error.limit, 'value');
  assert.equal(payloadSchemas.fields.scriptTestResult.name.limit, 'name');
  assert.equal(payloadSchemas.fields.updateCheckOptions.includePrereleases.type, 'boolean');
  assert.equal(payloadSchemas.fields.modalSettings.closeOnBackdropClick.type, 'boolean');
  assert.equal(payloadSchemas.fields.runnerConfig.stopOnFailure.type, 'boolean');
  assert.equal(payloadSchemas.fields.runner.allowEnvironmentMutation.type, 'boolean');
  assert.equal(payloadSchemas.fields.csvVariables.schema.limit, 'value');
  assert.equal(payloadSchemas.fields.csvVariables.values.limit, 'body');
  assert.equal(payloadSchemas.fields.csvVariables.filePath.limit, 'url');
  assert.equal(payloadSchemas.fields.csvVariables.activeSource.enum, 'csvVariableSources');
  assert.equal(payloadSchemas.fields.csvVariables.enabled.type, 'boolean');
  assert.equal(payloadSchemas.fields.csvVariables.reuseFirstRow.type, 'boolean');
  assert.equal(payloadSchemas.fields.csvVariables.loopRows.type, 'boolean');
  assert.equal(payloadSchemas.fields.csvVariables.continueWithoutRows.type, 'boolean');
  assert.equal(payloadSchemas.fields.runnerRequestSource.requestId.limit, 'name');
  assert.equal(payloadSchemas.fields.runnerProgress.requestId.limit, 'name');
  assert.equal(payloadSchemas.fields.oauthProgress.type.enum, 'oauthProgressTypes');
  assert.ok(payloadSchemas.auth.oauthProgressStatuses.includes('polling'));
  assert.ok(payloadSchemas.auth.oauthProgressStatuses.includes('callbackRejected'));
  assert.equal(payloadSchemas.fields.externalUrl.url.limit, 'url');
  assert.equal(payloadSchemas.fields.fileOperationResult.cancelled.type, 'boolean');
  assert.equal(payloadSchemas.fields.response.finalUrl.limit, 'url');
  assert.equal(payloadSchemas.fields.collectionRunRequestResult.error.limit, 'value');
  assert.equal(payloadSchemas.fields.collectionRunRequestResult.requestUrl.limit, 'url');
  assert.equal(payloadSchemas.fields.collectionRunRequestResult.requestDisplayName.limit, 'name');
  assert.equal(payloadSchemas.entities.request.nested[0], 'auth');
  assert.ok(payloadSchemas.entities.workspace.arrays.includes('runners'));
  assert.deepEqual(payloadSchemas.entities.runner.arrays, ['requests']);
  assert.deepEqual(payloadSchemas.entities.runner.nested, ['csvVariables']);
  assert.ok(payloadSchemas.entities.performanceTest.nested.includes('csvVariables'));
  assert.equal(payloadSchemas.auth.oauth2GrantTypes[0], 'authorizationCode');
  assert.deepEqual(payloadSchemas.enums.diagnosticLogLevels, ['debug', 'info', 'warn', 'error']);
  assert.deepEqual(payloadSchemas.enums.sameSiteValues, ['', 'Lax', 'Strict', 'None']);
  assert.equal(payloadSchemas.limits.url, 8192);
});

test('validates enum values through shared schema helper', () => {
  assert.throws(() => oneOf('archive', COLLECTION_EXPORT_FORMATS, 'format'), /format must be one of/);
  assert.deepEqual(schemaEnum('collectionExportFormats'), COLLECTION_EXPORT_FORMATS);
  assert.equal(fieldLimit('name'), 256);
  assert.equal(hasSchemaEnumValue('httpMethods', 'PATCH'), true);
  assert.equal(normalizeSchemaEnumValue('httpMethods', 'patch', 'GET', {
    trim: true,
    transform: (value) => value.toUpperCase()
  }), 'PATCH');
  assert.throws(() => oneOf('bad', COLLECTION_EXPORT_FORMATS, 'format'), /must be one of/);
  assert.throws(() => schemaEnum('unknownEnum'), /Unknown payload schema enum/);
});
