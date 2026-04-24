const {
  fieldLimit,
  hasSchemaEnumValue,
  oneOf,
  payloadSchemas
} = require('./payloadSchemas');

const FIELD_ENUMS = payloadSchemas.enums;
const LIMITS = payloadSchemas.limits;

function assertWorkspacePayload(value, field = 'workspace') {
  object(value, field);
  optionalNumber(value.schemaVersion, `${field}.schemaVersion`);
  optionalString(value.name, `${field}.name`, LIMITS.name);
  assertSchemaNested('workspace', value, field, {
    settings: assertSettingsPayload
  }, { settings: {} });
  assertSchemaArrays('workspace', value, field, {
    collections: assertCollectionArray,
    environments: assertEnvironmentArray,
    cookies: assertCookies,
    history: assertHistory
  });
}

function assertCollectionPayload(value, field = 'collection') {
  object(value, field);
  optionalString(value.id, `${field}.id`, LIMITS.name);
  optionalString(value.name, `${field}.name`, LIMITS.name);
  optionalString(value.description, `${field}.description`, LIMITS.value);
  assertPairs(value.variables || [], `${field}.variables`);
  assertCertificates(value.certificates || [], `${field}.certificates`);
  assertRequestArray(value.requests || [], `${field}.requests`);
  assertFolderArray(value.folders || [], `${field}.folders`, 0);
}

function assertRequestPayload(value, field = 'request') {
  object(value, field);
  optionalString(value.id, `${field}.id`, fieldLimit('name'));
  optionalString(value.name, `${field}.name`, fieldLimit('name'));
  optionalString(value.method, `${field}.method`, fieldLimit('method'));
  if (value.method && !hasSchemaEnumValue('httpMethods', value.method)) {
    fail(`${field}.method is not supported.`);
  }
  optionalString(value.url, `${field}.url`, fieldLimit('url'));
  assertPairs(value.queryParams || [], `${field}.queryParams`);
  assertPairs(value.headers || [], `${field}.headers`);
  optionalString(value.bodyType, `${field}.bodyType`, fieldLimit('short'));
  if (value.bodyType && !hasSchemaEnumValue('bodyTypes', value.bodyType)) {
    fail(`${field}.bodyType is not supported.`);
  }
  optionalString(value.body, `${field}.body`, fieldLimit('body'));
  assertSchemaArrays('request', value, field, {
    queryParams: assertPairs,
    headers: assertPairs,
    assertions: assertAssertions,
    variables: assertPairs,
    examples: assertExamples
  });
  assertSchemaNested('request', value, field, {
    auth: assertAuthPayload,
    scripts: assertScripts,
    cookieJar: assertRequestCookieJar,
    loadTestPolicy: assertLoadPolicyPayload
  }, {
    auth: { type: 'none' },
    cookieJar: {},
    loadTestPolicy: undefined,
    scripts: undefined
  });
}

function assertSettingsPayload(value, field) {
  object(value || {}, field);
  if (value.updates != null) {
    assertSchemaFields('updateCheckOptions', value.updates, `${field}.updates`);
  }
  if (value.appearance != null) {
    assertSchemaFields('appearance', value.appearance, `${field}.appearance`);
  }
  if (value.loadTestPolicy != null) {
    fail(`${field}.loadTestPolicy is no longer supported; configure load tests from the Load Test panel.`);
  }
}

function assertEnvironmentPayload(value, field = 'environment') {
  object(value, field);
  optionalString(value.id, `${field}.id`, LIMITS.name);
  optionalString(value.name, `${field}.name`, LIMITS.name);
  assertPairs(value.variables || [], `${field}.variables`);
}

function assertOptionalEnvironmentPayload(value, field = 'environment') {
  if (value == null) {
    return;
  }
  assertEnvironmentPayload(value, field);
}

function assertLoadConfigPayload(value, field = 'config') {
  assertSchemaFields('loadConfig', value, field);
  if (value.allowedHosts != null) {
    fail(`${field}.allowedHosts is no longer supported; load tests run against the active request URL.`);
  }
  if (value.hostPolicies != null) {
    fail(`${field}.hostPolicies is no longer supported; use the global rate cap instead.`);
  }
}

function assertLoadPolicyPayload(value, field = 'loadTestPolicy') {
  assertSchemaFields('loadPolicy', value || {}, field);
  if (value?.allowedHosts != null) {
    fail(`${field}.allowedHosts is no longer supported.`);
  }
  if (value?.hostPolicies != null) {
    fail(`${field}.hostPolicies is no longer supported.`);
  }
}

function assertLoadResultPayload(value, field = 'result') {
  object(value, field);
  const size = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (size > LIMITS.loadResultJson) {
    fail(`${field} is too large to export.`);
  }
  assertSchemaFields('loadResult', value, field);
  if (value.statusCounts != null) {
    object(value.statusCounts, `${field}.statusCounts`);
    for (const [statusCode, count] of Object.entries(value.statusCounts)) {
      string(statusCode, `${field}.statusCounts key`, LIMITS.tiny);
      number(count, `${field}.statusCounts.${statusCode}`);
    }
  }
  if (value.errors != null) {
    assertStringArray(value.errors, `${field}.errors`, LIMITS.pairs, LIMITS.value);
  }
  if (value.policyDecisions != null) {
    assertLoadPolicyDecisions(value.policyDecisions, `${field}.policyDecisions`);
  }
  if (value.latencyHistogram != null) {
    array(value.latencyHistogram, `${field}.latencyHistogram`, LIMITS.histogramBuckets).forEach((bucket, index) => {
      assertSchemaFields('loadHistogramBucket', bucket, `${field}.latencyHistogram[${index}]`);
    });
  }
  if (value.samples != null) {
    array(value.samples, `${field}.samples`, LIMITS.loadSamples).forEach((sample, index) => {
      assertSchemaFields('loadSample', sample, `${field}.samples[${index}]`);
    });
  }
}

function assertLoadProgressPayload(value, field = 'progress') {
  assertSchemaFields('loadProgress', value, field);
  if (value.policyDecisions != null) {
    assertLoadPolicyDecisions(value.policyDecisions, `${field}.policyDecisions`);
  }
}

function assertLoadPolicyDecisions(values, field) {
  array(values, field, LIMITS.pairs).forEach((decision, index) => {
    assertSchemaFields('loadPolicyDecision', decision, `${field}[${index}]`);
  });
}

function assertCollectionRunResultPayload(value, field = 'result') {
  object(value, field);
  const size = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (size > LIMITS.loadResultJson) {
    fail(`${field} is too large to export.`);
  }
  assertSchemaFields('collectionRunResult', value, field);
  if (value.results != null) {
    array(value.results, `${field}.results`, LIMITS.history).forEach((result, index) => {
      const itemField = `${field}.results[${index}]`;
      assertSchemaFields('collectionRunRequestResult', result, itemField);
      if (result.assertionResults != null) {
        array(result.assertionResults, `${itemField}.assertionResults`, LIMITS.pairs).forEach((assertionResult, assertionIndex) => {
          const assertionField = `${itemField}.assertionResults[${assertionIndex}]`;
          assertSchemaFields('assertionResult', assertionResult, assertionField);
        });
      }
      if (result.preRequestScriptResult != null) {
        assertScriptResult(result.preRequestScriptResult, `${itemField}.preRequestScriptResult`);
      }
      if (result.testScriptResult != null) {
        assertScriptResult(result.testScriptResult, `${itemField}.testScriptResult`);
      }
      if (result.extractedVariables != null) {
        assertPairs(result.extractedVariables, `${itemField}.extractedVariables`);
      }
      if (result.localVariables != null) {
        assertPairs(result.localVariables, `${itemField}.localVariables`);
      }
    });
  }
  if (value.environment != null) {
    assertEnvironmentPayload(value.environment, `${field}.environment`);
  }
  if (value.collectionVariables != null) {
    assertPairs(value.collectionVariables, `${field}.collectionVariables`);
  }
  if (value.cookies != null) {
    assertCookies(value.cookies, `${field}.cookies`);
  }
}

function assertRunnerConfigPayload(value, field = 'config') {
  assertSchemaFields('runnerConfig', value || {}, field);
}

function assertRunnerProgressPayload(value, field = 'progress') {
  assertSchemaFields('runnerProgress', value, field);
}

function assertResponsePayload(value, field = 'response') {
  assertSchemaFields('response', value, field);
  object(value.headers || {}, `${field}.headers`);
  for (const [key, values] of Object.entries(value.headers || {})) {
    string(key, `${field}.headers key`, LIMITS.key);
    array(values, `${field}.headers.${key}`, 100).forEach((headerValue, index) => {
      string(headerValue, `${field}.headers.${key}[${index}]`, LIMITS.value);
    });
  }
  if (value.updatedAuth != null) {
    assertAuthPayload(value.updatedAuth, `${field}.updatedAuth`);
  }
  if (value.updatedCookies != null) {
    assertCookies(value.updatedCookies, `${field}.updatedCookies`);
  }
  if (value.preRequestScriptResult != null) {
    assertScriptResult(value.preRequestScriptResult, `${field}.preRequestScriptResult`);
  }
  if (value.testScriptResult != null) {
    assertScriptResult(value.testScriptResult, `${field}.testScriptResult`);
  }
  if (value.environment != null) {
    assertEnvironmentPayload(value.environment, `${field}.environment`);
  }
  if (value.collectionVariables != null) {
    assertPairs(value.collectionVariables, `${field}.collectionVariables`);
  }
  if (value.localVariables != null) {
    assertPairs(value.localVariables, `${field}.localVariables`);
  }
}

function assertWorkspaceLoadResultPayload(value, field = 'result') {
  object(value, field);
  assertWorkspacePayload(value.workspace, `${field}.workspace`);
  optionalString(value.path, `${field}.path`, LIMITS.value);
  optionalString(value.activeWorkspaceId, `${field}.activeWorkspaceId`, LIMITS.value);
  optionalString(value.createdWorkspaceId, `${field}.createdWorkspaceId`, LIMITS.value);
  if (value.workspaces != null) {
    array(value.workspaces, `${field}.workspaces`, LIMITS.environments).forEach((workspaceItem, index) => {
      assertWorkspaceListItemPayload(workspaceItem, `${field}.workspaces[${index}]`);
    });
  }
  optionalBoolean(value.recovered, `${field}.recovered`);
  optionalString(value.recoveredPath, `${field}.recoveredPath`, LIMITS.value);
}

function assertUpdateCheckOptionsPayload(value, field = 'options') {
  assertSchemaFields('updateCheckOptions', value || {}, field);
}

function assertExternalUrlPayload(value, field = 'external') {
  assertSchemaFields('externalUrl', { url: value }, field);
}

function assertWorkspaceListItemPayload(value, field = 'workspaceItem') {
  object(value, field);
  string(value.id, `${field}.id`, LIMITS.value);
  string(value.name, `${field}.name`, LIMITS.name);
  optionalString(value.path, `${field}.path`, LIMITS.value);
  optionalBoolean(value.current, `${field}.current`);
  optionalBoolean(value.deletable, `${field}.deletable`);
  optionalNumber(value.schemaVersion, `${field}.schemaVersion`);
  optionalString(value.theme, `${field}.theme`, LIMITS.name);
  optionalNumber(value.collectionCount, `${field}.collectionCount`);
  optionalNumber(value.folderCount, `${field}.folderCount`);
  optionalNumber(value.requestCount, `${field}.requestCount`);
  optionalNumber(value.environmentCount, `${field}.environmentCount`);
  optionalNumber(value.cookieCount, `${field}.cookieCount`);
  optionalNumber(value.historyCount, `${field}.historyCount`);
}

function assertFileOperationResultPayload(value, field = 'result') {
  assertSchemaFields('fileOperationResult', value, field);
  if (value.workspace != null) {
    assertWorkspacePayload(value.workspace, `${field}.workspace`);
  }
  if (value.collection != null) {
    assertCollectionPayload(value.collection, `${field}.collection`);
  }
}

function assertOAuthProgressPayload(value, field = 'progress') {
  assertSchemaFields('oauthProgress', value, field);
}

function assertExportFormat(value, field = 'format') {
  try {
    oneOf(value, 'loadExportFormats', field);
  } catch (error) {
    fail(error.message);
  }
}

function assertCollectionExportFormat(value, field = 'format') {
  try {
    oneOf(value || 'postmeter', 'collectionExportFormats', field);
  } catch (error) {
    fail(error.message);
  }
}

function assertLoadId(value, field = 'id') {
  string(value, field, 128);
}

function assertAuthPayload(value, field = 'auth') {
  object(value, field);
  assertSchemaFields('auth', { ...value, type: value.type ?? 'none' }, field);
}

function assertRequestArray(values, field) {
  array(values, field, LIMITS.requestsPerLevel).forEach((request, index) => {
    assertRequestPayload(request, `${field}[${index}]`);
  });
}

function assertCollectionArray(values, field) {
  array(values, field, LIMITS.collections).forEach((collection, index) => {
    assertCollectionPayload(collection, `${field}[${index}]`);
  });
}

function assertEnvironmentArray(values, field) {
  array(values, field, LIMITS.environments).forEach((environment, index) => {
    assertEnvironmentPayload(environment, `${field}[${index}]`);
  });
}

function assertHistory(values, field) {
  array(values, field, LIMITS.history).forEach((entry, index) => {
    assertSchemaFields('historyEntry', entry, `${field}[${index}]`);
  });
}

function assertSchemaArrays(entityName, value, field, validators) {
  const schema = payloadSchemas.entities[entityName];
  for (const name of schema?.arrays || []) {
    const validator = validators[name];
    if (!validator) {
      fail(`${field}.${name} does not have an IPC validator.`);
    }
    validator(value[name] || [], `${field}.${name}`);
  }
}

function assertSchemaNested(entityName, value, field, validators, defaults = {}) {
  const schema = payloadSchemas.entities[entityName];
  for (const name of schema?.nested || []) {
    const validator = validators[name];
    if (!validator) {
      fail(`${field}.${name} does not have an IPC validator.`);
    }
    if (value[name] != null) {
      validator(value[name], `${field}.${name}`);
    } else if (Object.hasOwn(defaults, name) && defaults[name] !== undefined) {
      validator(defaults[name], `${field}.${name}`);
    }
  }
}

function assertFolderArray(values, field, depth) {
  if (depth > LIMITS.folderDepth) {
    fail(`${field} exceeds maximum folder depth.`);
  }
  array(values, field, LIMITS.foldersPerLevel).forEach((folder, index) => {
    const itemField = `${field}[${index}]`;
    assertSchemaFields('folder', folder, itemField);
    assertRequestArray(folder.requests || [], `${itemField}.requests`);
    assertFolderArray(folder.folders || [], `${itemField}.folders`, depth + 1);
  });
}

function assertPairs(values, field) {
  array(values, field, LIMITS.pairs).forEach((pair, index) => {
    const itemField = `${field}[${index}]`;
    assertSchemaFields('keyValue', pair, itemField);
  });
}

function assertAssertions(values, field) {
  array(values, field, LIMITS.pairs).forEach((assertion, index) => {
    const itemField = `${field}[${index}]`;
    assertSchemaFields('assertion', assertion, itemField);
  });
}

function assertScripts(value, field) {
  assertSchemaFields('scripts', value, field);
}

function assertExamples(values, field) {
  array(values, field, LIMITS.pairs).forEach((example, index) => {
    const itemField = `${field}[${index}]`;
    assertSchemaFields('example', example, itemField);
    assertPairs(example.headers || [], `${itemField}.headers`);
  });
}

function assertCertificates(values, field) {
  array(values, field, LIMITS.pairs).forEach((certificate, index) => {
    const itemField = `${field}[${index}]`;
    assertSchemaFields('certificate', certificate, itemField);
    array(certificate.matches || [], `${itemField}.matches`, LIMITS.pairs).forEach((match, matchIndex) => {
      string(match, `${itemField}.matches[${matchIndex}]`, LIMITS.url);
    });
  });
}

function assertRequestCookieJar(value, field) {
  assertSchemaFields('requestCookieJar', value || {}, field);
}

function assertCookies(values, field) {
  array(values, field, LIMITS.cookies).forEach((cookie, index) => {
    const itemField = `${field}[${index}]`;
    assertSchemaFields('cookie', cookie, itemField);
    if (cookie.extensions != null) {
      assertStringArray(cookie.extensions, `${itemField}.extensions`, LIMITS.pairs, LIMITS.value);
    }
  });
}

function assertScriptResult(value, field) {
  assertSchemaFields('scriptRunResult', value, field);
  if (value.tests != null) {
    array(value.tests, `${field}.tests`, LIMITS.pairs).forEach((testResult, index) => {
      assertSchemaFields('scriptTestResult', testResult, `${field}.tests[${index}]`);
    });
  }
  if (value.logs != null) {
    assertStringArray(value.logs, `${field}.logs`, LIMITS.pairs, LIMITS.value);
  }
}

function assertStringArray(values, field, maxItems, maxLength) {
  array(values, field, maxItems).forEach((value, index) => {
    string(value, `${field}[${index}]`, maxLength);
  });
}

function assertSchemaFields(schemaName, value, field) {
  object(value, field);
  const schema = payloadSchemas.fields?.[schemaName];
  if (!schema) {
    fail(`${field} does not have a shared field schema.`);
  }
  for (const [name, spec] of Object.entries(schema)) {
    const nextField = `${field}.${name}`;
    const nextValue = value[name];
    if (nextValue == null) {
      if (!spec.optional) {
        fail(`${nextField} is required.`);
      }
      continue;
    }
    if (spec.type === 'string') {
      string(nextValue, nextField, limitForField(spec.limit));
    } else if (spec.type === 'number') {
      number(nextValue, nextField);
    } else if (spec.type === 'boolean') {
      optionalBoolean(nextValue, nextField);
    } else {
      fail(`${nextField} has an unsupported schema type.`);
    }
    if (spec.enum) {
      const allowed = FIELD_ENUMS[spec.enum];
      if (!allowed) {
        fail(`${nextField} references an unknown enum.`);
      }
      const candidate = spec.type === 'string' ? nextValue : String(nextValue);
      if (!allowed.includes(candidate)) {
        fail(`${nextField} must be one of: ${allowed.join(', ')}.`);
      }
    }
  }
}

function limitForField(name) {
  try {
    return fieldLimit(name);
  } catch (error) {
    fail(error.message);
  }
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${field} must be an object.`);
  }
}

function array(value, field, max) {
  if (!Array.isArray(value)) {
    fail(`${field} must be an array.`);
  }
  if (value.length > max) {
    fail(`${field} cannot contain more than ${max} items.`);
  }
  return value;
}

function string(value, field, max) {
  if (typeof value !== 'string') {
    fail(`${field} must be a string.`);
  }
  if (value.length > max) {
    fail(`${field} cannot exceed ${max} characters.`);
  }
}

function optionalString(value, field, max) {
  if (value == null) {
    return;
  }
  string(value, field, max);
}

function number(value, field) {
  if (!Number.isFinite(Number(value))) {
    fail(`${field} must be a finite number.`);
  }
}

function optionalNumber(value, field) {
  if (value == null) {
    return;
  }
  number(value, field);
}

function optionalBoolean(value, field) {
  if (value == null) {
    return;
  }
  if (typeof value !== 'boolean') {
    fail(`${field} must be a boolean.`);
  }
}

function fail(message) {
  throw new Error(`Invalid IPC payload: ${message}`);
}

module.exports = {
  LIMITS,
  assertAuthPayload,
  assertCollectionPayload,
  assertCollectionRunResultPayload,
  assertCollectionExportFormat,
  assertEnvironmentPayload,
  assertExportFormat,
  assertLoadConfigPayload,
  assertLoadId,
  assertLoadProgressPayload,
  assertLoadResultPayload,
  assertOAuthProgressPayload,
  assertOptionalEnvironmentPayload,
  assertRunnerConfigPayload,
  assertRunnerProgressPayload,
  assertExternalUrlPayload,
  assertFileOperationResultPayload,
  assertResponsePayload,
  assertRequestPayload,
  assertUpdateCheckOptionsPayload,
  assertWorkspaceLoadResultPayload,
  assertWorkspacePayload
};
