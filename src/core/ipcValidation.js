const {
  fieldLimit,
  hasSchemaEnumValue,
  oneOf,
  payloadSchemas
} = require('./payloadSchemas');
const { MAX_OPEN_TABS } = require('./sessionState');

const FIELD_ENUMS = payloadSchemas.enums;
const LIMITS = payloadSchemas.limits;
const MAX_SANDBOX_FILE_BINDINGS = 1000;
const MAX_SANDBOX_PACKAGE_COUNT = 32;
const MAX_SANDBOX_PACKAGE_FILES = 128;
const MAX_SANDBOX_PACKAGE_DEPENDENCIES = 32;
const MAX_SANDBOX_PACKAGE_PACKAGE_DEPENDENCIES = 64;
const MAX_SANDBOX_PACKAGE_SOURCE_BYTES = 128 * 1024;
const MAX_VAULT_GRANT_IDS = 1000;

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
    globals: assertPairs,
    cookies: assertCookies,
    history: assertHistory
  });
}

function assertSessionPayload(value, field = 'session') {
  object(value, field);
  optionalNumber(value.version, `${field}.version`);
  for (const name of [
    'activeWorkspaceId',
    'selectedWorkspaceId',
    'activeEnvironmentId',
    'activeCollectionId',
    'activeFolderId',
    'activeRequestId'
  ]) {
    optionalString(value[name], `${field}.${name}`, LIMITS.value);
  }
  for (const name of [
    'activeSidebarPanel',
    'activeMainPanel',
    'activeRequestTab',
    'activeResultsTab'
  ]) {
    optionalString(value[name], `${field}.${name}`, LIMITS.short);
  }
  assertSessionRequestTabs(value.openRequestTabs || [], `${field}.openRequestTabs`);
  assertSessionEnvironmentTabs(value.openEnvironmentTabs || [], `${field}.openEnvironmentTabs`);
  assertSessionWorkspaceTabs(value.openWorkspaceTabs || [], `${field}.openWorkspaceTabs`);
  assertSessionDraftRequests(value.draftRequests || [], `${field}.draftRequests`);
  assertDirtyCollectionStates(value.dirtyCollectionStates || [], `${field}.dirtyCollectionStates`);
  if (value.dirtyCookieJarState != null) {
    assertDirtyCookieJarState(value.dirtyCookieJarState, `${field}.dirtyCookieJarState`);
  }
}

function assertWorkspaceSettingsSavePayload(value, field = 'settings') {
  assertSettingsPayload(value, field);
}

function assertWorkspaceSettingsSaveResultPayload(value, field = 'result') {
  object(value, field);
  assertSettingsPayload(value.settings || {}, `${field}.settings`);
}

function assertCollectionPayload(value, field = 'collection') {
  object(value, field);
  optionalString(value.id, `${field}.id`, LIMITS.name);
  optionalString(value.name, `${field}.name`, LIMITS.name);
  optionalString(value.description, `${field}.description`, LIMITS.value);
  optionalJsonObject(value.postman, `${field}.postman`, LIMITS.body);
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
  optionalString(value.protocol, `${field}.protocol`, fieldLimit('short'));
  if (value.protocol && !hasSchemaEnumValue('requestProtocols', value.protocol)) {
    fail(`${field}.protocol is not supported.`);
  }
  optionalString(value.methodPath, `${field}.methodPath`, fieldLimit('url'));
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
    examples: assertExamples,
    metadata: assertPairs,
    messages: assertProtocolMessages
  });
  optionalJsonObject(value.postmanBody, `${field}.postmanBody`, LIMITS.body);
  optionalJsonObject(value.protocolProfile, `${field}.protocolProfile`);
  optionalJsonObject(value.graphql, `${field}.graphql`);
  optionalJsonObject(value.grpc, `${field}.grpc`);
  optionalJsonObject(value.websocket, `${field}.websocket`);
  optionalJsonObject(value.postman, `${field}.postman`, LIMITS.body);
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
  if (value.tabs != null) {
    assertSchemaFields('tabSettings', value.tabs, `${field}.tabs`);
    assertNoUnexpectedFields('tabSettings', value.tabs, `${field}.tabs`);
  }
  if (value.diagnostics != null) {
    object(value.diagnostics, `${field}.diagnostics`);
    assertAllowedObjectFields(value.diagnostics, `${field}.diagnostics`, [
      'logging',
      'requestResponseLogging'
    ]);
    if (value.diagnostics.logging != null) {
      assertSchemaFields('diagnosticsLogging', value.diagnostics.logging, `${field}.diagnostics.logging`);
      assertNoUnexpectedFields('diagnosticsLogging', value.diagnostics.logging, `${field}.diagnostics.logging`);
    }
    if (value.diagnostics.requestResponseLogging != null) {
      assertSchemaFields('requestResponseLoggingSettings', value.diagnostics.requestResponseLogging, `${field}.diagnostics.requestResponseLogging`);
      assertNoUnexpectedFields('requestResponseLoggingSettings', value.diagnostics.requestResponseLogging, `${field}.diagnostics.requestResponseLogging`);
    }
  }
  if (value.sandbox != null) {
    object(value.sandbox, `${field}.sandbox`);
    assertAllowedObjectFields(value.sandbox, `${field}.sandbox`, [
      'fileBindings',
      'packageCache',
      'trustedCapabilities'
    ]);
    if (value.sandbox.fileBindings != null) {
      assertSandboxFileBindings(value.sandbox.fileBindings, `${field}.sandbox.fileBindings`);
    }
    if (value.sandbox.packageCache != null) {
      assertSandboxPackageCache(value.sandbox.packageCache, `${field}.sandbox.packageCache`);
    }
    if (value.sandbox.trustedCapabilities != null) {
      assertSchemaFields('sandboxSettings', value.sandbox.trustedCapabilities, `${field}.sandbox.trustedCapabilities`);
      assertNoUnexpectedFields('sandboxSettings', value.sandbox.trustedCapabilities, `${field}.sandbox.trustedCapabilities`, [
        'vaultGrants'
      ]);
      if (value.sandbox.trustedCapabilities.vaultGrants != null) {
        assertVaultGrants(value.sandbox.trustedCapabilities.vaultGrants, `${field}.sandbox.trustedCapabilities.vaultGrants`);
      }
    }
  }
  if (value.loadTestPolicy != null) {
    fail(`${field}.loadTestPolicy is no longer supported; configure load tests from the Load Test panel.`);
  }
}

function assertSandboxFileBindings(values, field) {
  array(values, field, MAX_SANDBOX_FILE_BINDINGS).forEach((binding, index) => {
    const itemField = `${field}[${index}]`;
    object(binding, itemField);
    assertAllowedObjectFields(binding, itemField, [
      'contentType',
      'enabled',
      'fileName',
      'filePath',
      'id',
      'key',
      'localPath',
      'mode',
      'path',
      'reviewedAt',
      'source',
      'src'
    ]);
    const source = binding.source ?? binding.src;
    const localPath = binding.localPath ?? binding.path ?? binding.filePath;
    string(source, `${itemField}.source`, LIMITS.value);
    string(localPath, `${itemField}.localPath`, LIMITS.value);
    optionalString(binding.id, `${itemField}.id`, LIMITS.name);
    optionalString(binding.key, `${itemField}.key`, LIMITS.key);
    optionalString(binding.contentType, `${itemField}.contentType`, LIMITS.value);
    optionalString(binding.fileName, `${itemField}.fileName`, LIMITS.name);
    optionalString(binding.reviewedAt, `${itemField}.reviewedAt`, LIMITS.name);
    optionalBoolean(binding.enabled, `${itemField}.enabled`);
    if (binding.mode != null) {
      string(binding.mode, `${itemField}.mode`, LIMITS.short);
      if (!['file', 'binary', 'formdata'].includes(String(binding.mode).trim().toLowerCase())) {
        fail(`${itemField}.mode must be one of: file, binary, formdata.`);
      }
    }
  });
}

function assertSandboxPackageCache(values, field) {
  array(values, field, MAX_SANDBOX_PACKAGE_COUNT).forEach((item, index) => {
    const itemField = `${field}[${index}]`;
    object(item, itemField);
    assertAllowedObjectFields(item, itemField, [
      'code',
      'dependencies',
      'dependencyAliases',
      'dependencyMap',
      'entrypoint',
      'fetchedAt',
      'files',
      'integrity',
      'manifest',
      'maxExportKeys',
      'name',
      'package',
      'packageDependencies',
      'packageIntegrity',
      'packageJson',
      'packageName',
      'packageVersion',
      'registry',
      'reviewedAt',
      'source',
      'sourceUrl',
      'specifier'
    ]);
    string(item.specifier ?? item.name, `${itemField}.specifier`, LIMITS.name);
    if (item.source == null && item.code == null && item.files == null) {
      fail(`${itemField}.source must be a string.`);
    }
    optionalString(item.source, `${itemField}.source`, MAX_SANDBOX_PACKAGE_SOURCE_BYTES);
    optionalString(item.code, `${itemField}.code`, MAX_SANDBOX_PACKAGE_SOURCE_BYTES);
    string(item.integrity, `${itemField}.integrity`, LIMITS.value);
    optionalString(item.entrypoint, `${itemField}.entrypoint`, LIMITS.name);
    optionalString(item.fetchedAt, `${itemField}.fetchedAt`, LIMITS.name);
    optionalString(item.packageIntegrity, `${itemField}.packageIntegrity`, LIMITS.value);
    optionalString(item.packageName, `${itemField}.packageName`, LIMITS.name);
    optionalString(item.packageVersion, `${itemField}.packageVersion`, LIMITS.name);
    optionalString(item.registry, `${itemField}.registry`, LIMITS.short);
    optionalString(item.reviewedAt, `${itemField}.reviewedAt`, LIMITS.name);
    optionalString(item.sourceUrl, `${itemField}.sourceUrl`, LIMITS.url);
    optionalNumber(item.maxExportKeys, `${itemField}.maxExportKeys`);
    assertOptionalStringMap(item.dependencyAliases, `${itemField}.dependencyAliases`, MAX_SANDBOX_PACKAGE_DEPENDENCIES);
    assertOptionalStringMap(item.dependencyMap, `${itemField}.dependencyMap`, MAX_SANDBOX_PACKAGE_DEPENDENCIES);
    if (item.dependencies != null) {
      assertStringArray(item.dependencies, `${itemField}.dependencies`, MAX_SANDBOX_PACKAGE_DEPENDENCIES, LIMITS.name);
    }
    if (item.packageDependencies != null) {
      assertStringArray(item.packageDependencies, `${itemField}.packageDependencies`, MAX_SANDBOX_PACKAGE_PACKAGE_DEPENDENCIES, LIMITS.name);
    }
    if (item.files != null) {
      assertSandboxPackageFiles(item.files, `${itemField}.files`);
    }
    optionalJsonObject(item.packageJson, `${itemField}.packageJson`, MAX_SANDBOX_PACKAGE_SOURCE_BYTES);
    optionalJsonObject(item.package, `${itemField}.package`, MAX_SANDBOX_PACKAGE_SOURCE_BYTES);
    optionalJsonObject(item.manifest, `${itemField}.manifest`, MAX_SANDBOX_PACKAGE_SOURCE_BYTES);
  });
}

function assertSandboxPackageFiles(value, field) {
  if (Array.isArray(value)) {
    array(value, field, MAX_SANDBOX_PACKAGE_FILES).forEach((file, index) => {
      const itemField = `${field}[${index}]`;
      object(file, itemField);
      assertAllowedObjectFields(file, itemField, [
        'code',
        'filename',
        'name',
        'path',
        'source',
        'text'
      ]);
      string(file.path ?? file.name ?? file.filename, `${itemField}.path`, LIMITS.key);
      optionalString(file.source, `${itemField}.source`, MAX_SANDBOX_PACKAGE_SOURCE_BYTES);
      optionalString(file.code, `${itemField}.code`, MAX_SANDBOX_PACKAGE_SOURCE_BYTES);
      optionalString(file.text, `${itemField}.text`, MAX_SANDBOX_PACKAGE_SOURCE_BYTES);
      if (file.source == null && file.code == null && file.text == null) {
        fail(`${itemField}.source must be a string.`);
      }
    });
    return;
  }
  object(value, field);
  const entries = Object.entries(value);
  if (entries.length > MAX_SANDBOX_PACKAGE_FILES) {
    fail(`${field} cannot contain more than ${MAX_SANDBOX_PACKAGE_FILES} files.`);
  }
  for (const [filePath, source] of entries) {
    string(filePath, `${field}.${filePath}.path`, LIMITS.key);
    string(source, `${field}.${filePath}`, MAX_SANDBOX_PACKAGE_SOURCE_BYTES);
  }
}

function assertVaultGrants(value, field) {
  object(value, field);
  assertAllowedObjectFields(value, field, [
    'collections',
    'deniedCollections',
    'deniedRequests',
    'requests',
    'workspace'
  ]);
  optionalBoolean(value.workspace, `${field}.workspace`);
  for (const name of ['collections', 'requests', 'deniedCollections', 'deniedRequests']) {
    if (value[name] != null) {
      assertStringArray(value[name], `${field}.${name}`, MAX_VAULT_GRANT_IDS, LIMITS.name);
    }
  }
}

function assertOptionalStringMap(value, field, maxItems) {
  if (value == null) {
    return;
  }
  object(value, field);
  const entries = Object.entries(value);
  if (entries.length > maxItems) {
    fail(`${field} cannot contain more than ${maxItems} entries.`);
  }
  for (const [key, target] of entries) {
    string(key, `${field}.${key}.key`, LIMITS.key);
    string(target, `${field}.${key}`, LIMITS.name);
  }
}

function assertEnvironmentPayload(value, field = 'environment') {
  object(value, field);
  optionalString(value.id, `${field}.id`, LIMITS.name);
  optionalString(value.name, `${field}.name`, LIMITS.name);
  assertPairs(value.variables || [], `${field}.variables`);
}

function assertWorkspaceRequestSavePayload(value, field = 'payload') {
  object(value, field);
  string(value.collectionId, `${field}.collectionId`, LIMITS.name);
  string(value.requestId, `${field}.requestId`, LIMITS.name);
  assertRequestPayload(value.request, `${field}.request`);
  optionalString(value.folderId, `${field}.folderId`, LIMITS.name);
  optionalBoolean(value.createdUnsaved, `${field}.createdUnsaved`);
  if (value.collectionShell != null) {
    object(value.collectionShell, `${field}.collectionShell`);
    optionalString(value.collectionShell.id, `${field}.collectionShell.id`, LIMITS.name);
    optionalString(value.collectionShell.name, `${field}.collectionShell.name`, LIMITS.name);
    optionalString(value.collectionShell.description, `${field}.collectionShell.description`, LIMITS.value);
    assertCertificates(value.collectionShell.certificates || [], `${field}.collectionShell.certificates`);
  }
  if (value.folderPath != null) {
    array(value.folderPath, `${field}.folderPath`, LIMITS.folderDepth).forEach((folder, index) => {
      object(folder, `${field}.folderPath[${index}]`);
      optionalString(folder.id, `${field}.folderPath[${index}].id`, LIMITS.name);
      optionalString(folder.name, `${field}.folderPath[${index}].name`, LIMITS.name);
    });
  }
  if (value.collectionVariables != null) {
    assertPairs(value.collectionVariables, `${field}.collectionVariables`);
  }
  if (value.globals != null) {
    assertPairs(value.globals, `${field}.globals`);
  }
  if (value.cookies != null) {
    assertCookies(value.cookies, `${field}.cookies`);
  }
  if (value.settings != null) {
    assertSettingsPayload(value.settings, `${field}.settings`);
  }
}

function assertWorkspaceRequestSaveResultPayload(value, field = 'result') {
  object(value, field);
  assertRequestPayload(value.request, `${field}.request`);
  if (value.collectionVariables != null) {
    assertPairs(value.collectionVariables, `${field}.collectionVariables`);
  }
  if (value.globals != null) {
    assertPairs(value.globals, `${field}.globals`);
  }
  if (value.cookies != null) {
    assertCookies(value.cookies, `${field}.cookies`);
  }
}

function assertWorkspaceEnvironmentSavePayload(value, field = 'payload') {
  object(value, field);
  string(value.environmentId, `${field}.environmentId`, LIMITS.name);
  optionalBoolean(value.createdUnsaved, `${field}.createdUnsaved`);
  assertEnvironmentPayload(value.environment, `${field}.environment`);
  if (value.settings != null) {
    assertSettingsPayload(value.settings, `${field}.settings`);
  }
}

function assertWorkspaceEnvironmentSaveResultPayload(value, field = 'result') {
  object(value, field);
  assertEnvironmentPayload(value.environment, `${field}.environment`);
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
  if (value.updatedAuth != null) {
    fail(`${field}.updatedAuth must not be included in public IPC payloads.`);
  }
  assertNoUnexpectedFields('loadResult', value, field, [
    'cookies',
    'errors',
    'latencyHistogram',
    'policyDecisions',
    'sampleLimit',
    'sampleLimitReached',
    'samples',
    'statusCounts'
  ]);
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
      assertNoUnexpectedFields('loadHistogramBucket', bucket, `${field}.latencyHistogram[${index}]`);
    });
  }
  if (value.samples != null) {
    array(value.samples, `${field}.samples`, LIMITS.loadSamples).forEach((sample, index) => {
      assertSchemaFields('loadSample', sample, `${field}.samples[${index}]`);
      assertNoUnexpectedFields('loadSample', sample, `${field}.samples[${index}]`);
    });
  }
  if (value.sampleLimit != null) {
    number(value.sampleLimit, `${field}.sampleLimit`);
  }
  if (value.sampleLimitReached != null) {
    optionalBoolean(value.sampleLimitReached, `${field}.sampleLimitReached`);
  }
  if (value.cookies != null) {
    assertCookies(value.cookies, `${field}.cookies`);
  }
}

function assertLoadProgressPayload(value, field = 'progress') {
  assertSchemaFields('loadProgress', value, field);
  assertNoUnexpectedFields('loadProgress', value, field, [
    'policyDecisions'
  ]);
  if (value.policyDecisions != null) {
    assertLoadPolicyDecisions(value.policyDecisions, `${field}.policyDecisions`);
  }
}

function assertLoadPolicyDecisions(values, field) {
  array(values, field, LIMITS.pairs).forEach((decision, index) => {
    assertSchemaFields('loadPolicyDecision', decision, `${field}[${index}]`);
    assertNoUnexpectedFields('loadPolicyDecision', decision, `${field}[${index}]`);
  });
}

function assertCollectionRunResultPayload(value, field = 'result') {
  object(value, field);
  const size = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (size > LIMITS.loadResultJson) {
    fail(`${field} is too large to export.`);
  }
  assertSchemaFields('collectionRunResult', value, field);
  assertNoUnexpectedFields('collectionRunResult', value, field, [
    'collectionVariables',
    'cookies',
    'environment',
    'globals',
    'results'
  ]);
  if (value.results != null) {
    array(value.results, `${field}.results`, LIMITS.history).forEach((result, index) => {
      const itemField = `${field}.results[${index}]`;
      assertSchemaFields('collectionRunRequestResult', result, itemField);
      if (result.updatedAuth != null) {
        fail(`${itemField}.updatedAuth must not be included in public IPC payloads.`);
      }
      assertNoUnexpectedFields('collectionRunRequestResult', result, itemField, [
        'afterResponseScriptResult',
        'assertionResults',
        'extractedVariables',
        'localVariables',
        'messageScriptResults',
        'preRequestScriptResult',
        'testScriptResult'
      ]);
      if (result.assertionResults != null) {
        array(result.assertionResults, `${itemField}.assertionResults`, LIMITS.pairs).forEach((assertionResult, assertionIndex) => {
          const assertionField = `${itemField}.assertionResults[${assertionIndex}]`;
          assertSchemaFields('assertionResult', assertionResult, assertionField);
          assertNoUnexpectedFields('assertionResult', assertionResult, assertionField, [
            'actual',
            'assertion',
            'expected',
            'extractedVariable'
          ]);
          if (assertionResult.actual != null) {
            optionalJsonValue(assertionResult.actual, `${assertionField}.actual`, LIMITS.value);
          }
          if (assertionResult.assertion != null) {
            assertSchemaFields('assertion', assertionResult.assertion, `${assertionField}.assertion`);
            assertNoUnexpectedFields('assertion', assertionResult.assertion, `${assertionField}.assertion`);
          }
          if (assertionResult.expected != null) {
            optionalJsonValue(assertionResult.expected, `${assertionField}.expected`, LIMITS.value);
          }
          if (assertionResult.extractedVariable != null) {
            assertSchemaFields('keyValue', assertionResult.extractedVariable, `${assertionField}.extractedVariable`);
          }
        });
      }
      if (result.preRequestScriptResult != null) {
        assertScriptResult(result.preRequestScriptResult, `${itemField}.preRequestScriptResult`);
      }
      if (result.messageScriptResults != null) {
        array(result.messageScriptResults, `${itemField}.messageScriptResults`, LIMITS.pairs).forEach((scriptResult, scriptIndex) => {
          assertScriptResult(scriptResult, `${itemField}.messageScriptResults[${scriptIndex}]`);
        });
      }
      if (result.afterResponseScriptResult != null) {
        assertScriptResult(result.afterResponseScriptResult, `${itemField}.afterResponseScriptResult`);
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
  if (value.globals != null) {
    assertPairs(value.globals, `${field}.globals`);
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
  assertNoUnexpectedFields('runnerProgress', value, field);
}

function assertResponsePayload(value, field = 'response') {
  assertSchemaFields('response', value, field);
  if (value.updatedAuth != null) {
    fail(`${field}.updatedAuth must not be included in public IPC payloads.`);
  }
  assertNoUnexpectedFields('response', value, field, [
    'collectionVariables',
    'environment',
    'error',
    'globals',
    'headers',
    'localVariables',
    'preRequestScriptResult',
    'requestSent',
    'testScriptResult',
    'updatedCookies'
  ]);
  object(value.headers || {}, `${field}.headers`);
  for (const [key, values] of Object.entries(value.headers || {})) {
    string(key, `${field}.headers key`, LIMITS.key);
    array(values, `${field}.headers.${key}`, 100).forEach((headerValue, index) => {
      string(headerValue, `${field}.headers.${key}[${index}]`, LIMITS.value);
    });
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
  if (value.globals != null) {
    assertPairs(value.globals, `${field}.globals`);
  }
  if (value.localVariables != null) {
    assertPairs(value.localVariables, `${field}.localVariables`);
  }
  if (value.requestSent != null) {
    optionalBoolean(value.requestSent, `${field}.requestSent`);
  }
  if (value.skipped != null) {
    optionalBoolean(value.skipped, `${field}.skipped`);
  }
  if (value.error != null) {
    string(value.error, `${field}.error`, LIMITS.value);
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
  assertNoUnexpectedFields('oauthProgress', value, field);
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

function assertSessionRequestTabs(values, field) {
  array(values, field, MAX_OPEN_TABS).forEach((tab, index) => {
    const itemField = `${field}[${index}]`;
    object(tab, itemField);
    for (const name of ['key', 'collectionId', 'requestId', 'folderId']) {
      optionalString(tab[name], `${itemField}.${name}`, LIMITS.value);
    }
    optionalBoolean(tab.draft, `${itemField}.draft`);
    optionalBoolean(tab.dirty, `${itemField}.dirty`);
    optionalBoolean(tab.createdUnsaved, `${itemField}.createdUnsaved`);
    optionalString(tab.snapshot, `${itemField}.snapshot`, LIMITS.body);
    if (tab.currentState != null) {
      assertRequestPayload(tab.currentState, `${itemField}.currentState`);
    }
  });
}

function assertSessionEnvironmentTabs(values, field) {
  array(values, field, MAX_OPEN_TABS).forEach((tab, index) => {
    const itemField = `${field}[${index}]`;
    object(tab, itemField);
    optionalString(tab.key, `${itemField}.key`, LIMITS.value);
    optionalString(tab.environmentId, `${itemField}.environmentId`, LIMITS.value);
    optionalBoolean(tab.dirty, `${itemField}.dirty`);
    optionalBoolean(tab.createdUnsaved, `${itemField}.createdUnsaved`);
    optionalString(tab.snapshot, `${itemField}.snapshot`, LIMITS.body);
    if (tab.currentState != null) {
      assertEnvironmentPayload(tab.currentState, `${itemField}.currentState`);
    }
  });
}

function assertSessionWorkspaceTabs(values, field) {
  array(values, field, MAX_OPEN_TABS).forEach((tab, index) => {
    const itemField = `${field}[${index}]`;
    object(tab, itemField);
    optionalString(tab.key, `${itemField}.key`, LIMITS.value);
    optionalString(tab.workspaceId, `${itemField}.workspaceId`, LIMITS.value);
    optionalBoolean(tab.dirty, `${itemField}.dirty`);
  });
}

function assertSessionDraftRequests(values, field) {
  array(values, field, MAX_OPEN_TABS).forEach((request, index) => {
    assertRequestPayload(request, `${field}[${index}]`);
  });
}

function assertDirtyCollectionStates(values, field) {
  array(values, field, MAX_OPEN_TABS).forEach((state, index) => {
    const itemField = `${field}[${index}]`;
    object(state, itemField);
    optionalString(state.collectionId, `${itemField}.collectionId`, LIMITS.value);
    optionalString(state.ownerKey, `${itemField}.ownerKey`, LIMITS.value);
    optionalString(state.snapshot, `${itemField}.snapshot`, LIMITS.body);
    assertPairs(state.currentState || [], `${itemField}.currentState`);
  });
}

function assertDirtyCookieJarState(value, field) {
  object(value, field);
  optionalString(value.ownerKey, `${field}.ownerKey`, LIMITS.value);
  optionalString(value.snapshot, `${field}.snapshot`, LIMITS.body);
  assertCookies(value.currentState || [], `${field}.currentState`);
}

function assertFolderArray(values, field, depth) {
  if (depth > LIMITS.folderDepth) {
    fail(`${field} exceeds maximum folder depth.`);
  }
  array(values, field, LIMITS.foldersPerLevel).forEach((folder, index) => {
    const itemField = `${field}[${index}]`;
    assertSchemaFields('folder', folder, itemField);
    optionalJsonObject(folder.postman, `${itemField}.postman`, LIMITS.body);
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
    optionalJsonObject(example.postman, `${itemField}.postman`, LIMITS.body);
    assertPairs(example.headers || [], `${itemField}.headers`);
  });
}

function assertProtocolMessages(values, field) {
  array(values, field, LIMITS.pairs).forEach((message, index) => {
    const itemField = `${field}[${index}]`;
    object(message, itemField);
    assertSchemaFields('protocolMessage', message, itemField);
    const data = message.data ?? message.value;
    if (data == null) {
      return;
    }
    if (typeof data === 'string') {
      string(data, `${itemField}.data`, LIMITS.value);
      return;
    }
    optionalJsonValue(data, `${itemField}.data`, LIMITS.value);
  });
}

function optionalJsonValue(value, field, maxBytes = 128 * 1024) {
  if (value == null) {
    return;
  }
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    fail(`${field} must be JSON-serializable.`);
  }
  if (Buffer.byteLength(text || '', 'utf8') > maxBytes) {
    fail(`${field} cannot exceed ${maxBytes} bytes when serialized.`);
  }
}

function optionalJsonObject(value, field, maxBytes = 128 * 1024) {
  if (value == null) {
    return;
  }
  object(value, field);
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    fail(`${field} must be JSON-serializable.`);
  }
  if (Buffer.byteLength(text || '', 'utf8') > maxBytes) {
    fail(`${field} cannot exceed ${maxBytes} bytes when serialized.`);
  }
}

function assertCertificates(values, field) {
  array(values, field, LIMITS.pairs).forEach((certificate, index) => {
    const itemField = `${field}[${index}]`;
    assertSchemaFields('certificate', certificate, itemField);
    optionalJsonObject(certificate.postman, `${itemField}.postman`, LIMITS.body);
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
  assertNoUnexpectedFields('scriptRunResult', value, field, [
    'commitSideEffects',
    'execution',
    'logs',
    'mock',
    'request',
    'tests',
    'visualizer'
  ]);
  if (value.tests != null) {
    array(value.tests, `${field}.tests`, LIMITS.pairs).forEach((testResult, index) => {
      assertSchemaFields('scriptTestResult', testResult, `${field}.tests[${index}]`);
      assertNoUnexpectedFields('scriptTestResult', testResult, `${field}.tests[${index}]`);
    });
  }
  if (value.logs != null) {
    assertStringArray(value.logs, `${field}.logs`, LIMITS.pairs, LIMITS.value);
  }
  if (value.visualizer != null) {
    assertSchemaFields('scriptVisualizer', value.visualizer, `${field}.visualizer`);
    assertNoUnexpectedFields('scriptVisualizer', value.visualizer, `${field}.visualizer`, [
      'assets',
      'data'
    ]);
    if (value.visualizer.assets != null) {
      array(value.visualizer.assets, `${field}.visualizer.assets`, LIMITS.pairs).forEach((asset, assetIndex) => {
        optionalJsonObject(asset, `${field}.visualizer.assets[${assetIndex}]`, LIMITS.value);
      });
    }
    if (value.visualizer.data != null) {
      optionalJsonObject(value.visualizer.data, `${field}.visualizer.data`, LIMITS.body);
    }
  }
  if (value.commitSideEffects != null) {
    optionalBoolean(value.commitSideEffects, `${field}.commitSideEffects`);
  }
  if (value.execution != null) {
    optionalJsonObject(value.execution, `${field}.execution`, LIMITS.body);
  }
  if (value.request != null) {
    optionalJsonObject(value.request, `${field}.request`, LIMITS.body);
  }
  if (value.mock != null) {
    optionalJsonObject(value.mock, `${field}.mock`, LIMITS.body);
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

function assertNoUnexpectedFields(schemaName, value, field, allowedExtraFields = []) {
  object(value, field);
  const schema = payloadSchemas.fields?.[schemaName];
  if (!schema) {
    fail(`${field} does not have a shared field schema.`);
  }
  const allowed = new Set([
    ...Object.keys(schema),
    ...allowedExtraFields
  ]);
  for (const name of Object.keys(value)) {
    if (!allowed.has(name)) {
      fail(`${field}.${name} is not allowed in public IPC payloads.`);
    }
  }
}

function assertAllowedObjectFields(value, field, allowedFields) {
  object(value, field);
  const allowed = new Set(allowedFields);
  for (const name of Object.keys(value)) {
    if (!allowed.has(name)) {
      fail(`${field}.${name} is not allowed in public IPC payloads.`);
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
  assertSessionPayload,
  assertExternalUrlPayload,
  assertFileOperationResultPayload,
  assertResponsePayload,
  assertRequestPayload,
  assertUpdateCheckOptionsPayload,
  assertWorkspaceEnvironmentSavePayload,
  assertWorkspaceEnvironmentSaveResultPayload,
  assertWorkspaceLoadResultPayload,
  assertWorkspaceRequestSavePayload,
  assertWorkspaceRequestSaveResultPayload,
  assertWorkspaceSettingsSavePayload,
  assertWorkspaceSettingsSaveResultPayload,
  assertWorkspacePayload
};
