const {
  fieldLimit,
  hasSchemaEnumValue,
  normalizeSchemaEnumValue,
  oneOf,
  payloadSchemas
} = require('./payloadSchemas');
const {
  normalizePerformanceConfig,
  normalizePerformanceSafetyLimits
} = require('./models');
const {
  DIAGNOSIS_TYPE,
  diagnosisEffectiveConcurrency,
  diagnosisPlannedRequestCount,
  normalizeDiagnosisScope
} = require('./performanceDiagnosis');
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
const TYPOGRAPHY_FONT_SIZE_VALUES = Object.freeze([10, 13, 16, 19]);
const HARD_PERFORMANCE_LIMITS = Object.freeze({
  maxTotalRequests: 1000000,
  maxConcurrency: 25,
  maxDurationSeconds: 60 * 60
});

function assertWorkspacePayload(value, field = 'workspace') {
  object(value, field);
  optionalNumber(value.schemaVersion, `${field}.schemaVersion`);
  optionalString(value.name, `${field}.name`, LIMITS.name);
  assertSchemaNested('workspace', value, field, {
    settings: assertSettingsPayload,
    localsettings: assertSettingsPayload
  }, { settings: {}, localsettings: {} });
  assertSchemaArrays('workspace', value, field, {
    collections: assertCollectionArray,
    environments: assertEnvironmentArray,
    globals: assertPairs,
    cookies: assertCookies,
    runners: assertRunnerArray,
    performanceTests: assertPerformanceTestArray,
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
    'activeRequestId',
    'activeRunnerRequestRunnerId',
    'activeRunnerConfigId',
    'activePerformanceTestId'
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
  assertSessionCollectionTabs(value.openCollectionTabs || [], `${field}.openCollectionTabs`);
  assertSessionFolderTabs(value.openFolderTabs || [], `${field}.openFolderTabs`);
  assertSessionRequestTabs(value.openRequestTabs || [], `${field}.openRequestTabs`);
  assertSessionEnvironmentTabs(value.openEnvironmentTabs || [], `${field}.openEnvironmentTabs`);
  assertSessionWorkspaceTabs(value.openWorkspaceTabs || [], `${field}.openWorkspaceTabs`);
  assertSessionRunnerTabs(value.openRunnerTabs || [], `${field}.openRunnerTabs`);
  assertSessionPerformanceTabs(value.openPerformanceTabs || [], `${field}.openPerformanceTabs`);
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
  assertAuthPayload(value.auth || { type: 'none' }, `${field}.auth`);
  assertScripts(value.scripts || {}, `${field}.scripts`);
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
  optionalString(value.docs, `${field}.docs`, fieldLimit('body'));
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
    variables: assertPairs,
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
    autoHeaders: assertRequestAutoHeaders,
    settings: assertRequestSettings
  }, {
    auth: { type: 'none' },
    cookieJar: {},
    autoHeaders: {},
    settings: {},
    scripts: undefined
  });
  if (value.loadTestPolicy != null) {
    fail(`${field}.loadTestPolicy is no longer supported.`);
  }
  if (value.examples != null) {
    fail(`${field}.examples is no longer supported.`);
  }
}

function assertRunnerPayload(value, field = 'runner') {
  assertSchemaFields('runner', value, field);
  assertNoUnexpectedFields('runner', value, field, [
    'capturePolicy',
    'csvVariables',
    'requests'
  ]);
  if (value.capturePolicy != null) {
    assertCapturePolicyPayload(value.capturePolicy, `${field}.capturePolicy`);
  }
  assertCsvVariablesPayload(value.csvVariables || {}, `${field}.csvVariables`);
  assertRunnerRequestArray(value.requests, `${field}.requests`);
}

function assertRunnerRequestPayload(value, field = 'request') {
  assertRequestPayload(value, field);
  assertAllowedObjectFields(value, field, [
    'auth',
    'body',
    'bodyType',
    'cookieJar',
    'docs',
    'graphql',
    'grpc',
    'headers',
    'id',
    'iterations',
    'method',
    'methodPath',
    'messages',
    'metadata',
    'name',
    'postman',
    'postmanBody',
    'protocol',
    'protocolProfile',
    'queryParams',
    'autoHeaders',
    'scripts',
    'source',
    'settings',
    'url',
    'variables',
    'websocket'
  ]);
  assertOptionalInteger(value.iterations, `${field}.iterations`, 1);
  if (value.iterations != null && Number(value.iterations) > LIMITS.runnerIterations) {
    fail(`${field}.iterations cannot exceed ${LIMITS.runnerIterations}.`);
  }
  if (value.source != null) {
    assertRunnerRequestSourcePayload(value.source, `${field}.source`);
  }
}

function assertRequestAutoHeaders(value, field = 'autoHeaders') {
  assertSchemaFields('requestAutoHeaders', value || {}, field);
  assertNoUnexpectedFields('requestAutoHeaders', value || {}, field);
}

function assertRequestSettings(value, field = 'settings') {
  object(value || {}, field);
  assertAllowedObjectFields(value || {}, field, [
    'sslCertificateVerification'
  ]);
  if (
    value?.sslCertificateVerification != null
    && typeof value.sslCertificateVerification !== 'boolean'
    && !['inherit', 'enabled', 'disabled'].includes(String(value.sslCertificateVerification))
  ) {
    fail(`${field}.sslCertificateVerification is not supported.`);
  }
}

function assertCsvVariablesPayload(value, field = 'csvVariables') {
  assertSchemaFields('csvVariables', value || {}, field);
  assertNoUnexpectedFields('csvVariables', value || {}, field);
}

function assertCapturePolicyPayload(value, field = 'capturePolicy') {
  object(value, field);
  assertAllowedObjectFields(value, field, [
    'bodyPreviewBytes',
    'guardrailNotes',
    'localVariables',
    'maxBodyPreviews',
    'postRequestOutput',
    'preRequestOutput',
    'responseBody',
    'responseHeaders',
    'resultFileBudgetBytes',
    'scriptLogs',
    'transportTimings'
  ]);
  if (value.responseBody != null) {
    const mode = String(value.responseBody || '').trim().toLowerCase();
    optionalString(value.responseBody, `${field}.responseBody`, LIMITS.short);
    if (!['none', 'failed', 'sampled', 'all'].includes(mode)) {
      fail(`${field}.responseBody must be one of: none, failed, sampled, all.`);
    }
  }
  for (const name of ['bodyPreviewBytes', 'maxBodyPreviews', 'resultFileBudgetBytes']) {
    if (value[name] != null) {
      assertOptionalInteger(value[name], `${field}.${name}`, 0);
    }
  }
  for (const name of ['preRequestOutput', 'postRequestOutput', 'scriptLogs', 'localVariables', 'responseHeaders', 'transportTimings']) {
    optionalBoolean(value[name], `${field}.${name}`);
  }
  if (value.guardrailNotes != null) {
    assertStringArray(value.guardrailNotes, `${field}.guardrailNotes`, 8, LIMITS.value);
  }
}

function assertResultPagePayload(value, field = 'resultPage') {
  object(value, field);
  assertAllowedObjectFields(value, field, [
    'limit',
    'offset',
    'statusCounts',
    'total',
    'totalAll'
  ]);
  optionalNumber(value.offset, `${field}.offset`);
  optionalNumber(value.limit, `${field}.limit`);
  optionalNumber(value.total, `${field}.total`);
  optionalNumber(value.totalAll, `${field}.totalAll`);
  if (value.statusCounts != null) {
    object(value.statusCounts, `${field}.statusCounts`);
    for (const [status, count] of Object.entries(value.statusCounts)) {
      string(status, `${field}.statusCounts key`, LIMITS.short);
      optionalNumber(count, `${field}.statusCounts.${status}`);
    }
  }
}

function assertRunnerRequestSourcePayload(value, field = 'source') {
  assertSchemaFields('runnerRequestSource', value, field);
  assertNoUnexpectedFields('runnerRequestSource', value, field, [
    'folderPath'
  ]);
  if (value.folderPath != null) {
    assertStringArray(value.folderPath, `${field}.folderPath`, LIMITS.folderDepth, LIMITS.name);
  }
}

function assertPerformanceTestPayload(value, field = 'performanceTest') {
  assertSchemaFields('performanceTest', value, field);
  assertNoUnexpectedFields('performanceTest', value, field, [
    'capturePolicy',
    'config',
    'csvVariables',
    'request',
    'resultsMetadata',
    'safetyLimits',
    'source',
    'typeSettings'
  ]);
  assertCsvVariablesPayload(value.csvVariables || {}, `${field}.csvVariables`);
  assertRequestPayload(value.request, `${field}.request`);
  assertPerformanceTestSourcePayload(value.source || { sourceType: 'manual' }, `${field}.source`);
  assertPerformanceConfigPayload(value.config || {}, `${field}.config`);
  assertPerformanceSafetyLimitsPayload(value.safetyLimits || {}, `${field}.safetyLimits`);
  if (value.capturePolicy != null) {
    assertCapturePolicyPayload(value.capturePolicy, `${field}.capturePolicy`);
  }
  if (value.typeSettings != null) {
    assertPerformanceTypeSettingsPayload(value.typeSettings, `${field}.typeSettings`);
  }
  assertPerformanceResultsMetadataPayload(value.resultsMetadata || {}, `${field}.resultsMetadata`);
  assertPerformanceSafety(value, field);
}

function assertPerformanceTestSourcePayload(value, field = 'source') {
  assertSchemaFields('performanceTestSource', value, field);
  assertNoUnexpectedFields('performanceTestSource', value, field, [
    'folderPath'
  ]);
  if (value.sourceType != null && !['manual', 'collection'].includes(String(value.sourceType))) {
    fail(`${field}.sourceType must be one of: manual, collection.`);
  }
  if (value.folderPath != null) {
    assertStringArray(value.folderPath, `${field}.folderPath`, LIMITS.folderDepth, LIMITS.name);
  }
}

function assertPerformanceConfigPayload(value, field = 'config') {
  assertSchemaFields('performanceConfig', value || {}, field);
  assertNoUnexpectedFields('performanceConfig', value || {}, field);
  for (const name of ['iterations', 'startConcurrency', 'concurrency', 'durationSeconds', 'rampSteps', 'spikeMultiplier']) {
    assertOptionalInteger(value?.[name], `${field}.${name}`, name === 'durationSeconds' ? 0 : 1);
  }
  if (value?.diagnosisScope != null) {
    const scope = String(value.diagnosisScope).trim().toLowerCase();
    optionalString(value.diagnosisScope, `${field}.diagnosisScope`, LIMITS.tiny);
    if (normalizeDiagnosisScope(scope) !== scope) {
      fail(`${field}.diagnosisScope must be one of: quick, medium, extended.`);
    }
  }
}

function assertPerformanceSafetyLimitsPayload(value, field = 'safetyLimits') {
  assertSchemaFields('performanceSafetyLimits', value || {}, field);
  assertNoUnexpectedFields('performanceSafetyLimits', value || {}, field);
  for (const name of ['maxTotalRequests', 'maxConcurrency', 'maxDurationSeconds']) {
    assertOptionalInteger(value?.[name], `${field}.${name}`, 1);
  }
}

function assertPerformanceTypeSettingsPayload(value, field = 'typeSettings') {
  object(value || {}, field);
  const allowedTypes = FIELD_ENUMS.performanceTestTypes || [];
  for (const [type, setting] of Object.entries(value || {})) {
    const settingField = `${field}.${type}`;
    if (!allowedTypes.includes(type)) {
      fail(`${settingField} is not an allowed performance test type setting.`);
    }
    object(setting, settingField);
    assertAllowedObjectFields(setting, settingField, [
      'allowEnvironmentMutation',
      'config',
      'environmentId',
      'safetyLimits'
    ]);
    optionalString(setting.environmentId, `${settingField}.environmentId`, LIMITS.name);
    optionalBoolean(setting.allowEnvironmentMutation, `${settingField}.allowEnvironmentMutation`);
    assertPerformanceConfigPayload(setting.config || {}, `${settingField}.config`);
    assertPerformanceSafetyLimitsPayload(setting.safetyLimits || {}, `${settingField}.safetyLimits`);
    assertPerformanceSafety({
      type,
      config: setting.config,
      safetyLimits: setting.safetyLimits
    }, settingField);
  }
}

function assertPerformanceResultsMetadataPayload(value, field = 'resultsMetadata') {
  assertSchemaFields('performanceResultsMetadata', value || {}, field);
  assertNoUnexpectedFields('performanceResultsMetadata', value || {}, field);
  assertOptionalInteger(value?.runCount, `${field}.runCount`, 0);
}

function assertPerformanceSafety(value, field = 'performanceTest') {
  const type = normalizeSchemaEnumValue('performanceTestTypes', value?.type, DIAGNOSIS_TYPE, { trim: true });
  const rawConfig = value?.config && typeof value.config === 'object' && !Array.isArray(value.config) ? value.config : {};
  const rawSafetyLimits = value?.safetyLimits && typeof value.safetyLimits === 'object' && !Array.isArray(value.safetyLimits) ? value.safetyLimits : {};
  assertPerformanceMaximum(rawSafetyLimits.maxTotalRequests, `${field}.safetyLimits.maxTotalRequests`, HARD_PERFORMANCE_LIMITS.maxTotalRequests);
  assertPerformanceMaximum(rawSafetyLimits.maxConcurrency, `${field}.safetyLimits.maxConcurrency`, HARD_PERFORMANCE_LIMITS.maxConcurrency);
  assertPerformanceMaximum(rawSafetyLimits.maxDurationSeconds, `${field}.safetyLimits.maxDurationSeconds`, HARD_PERFORMANCE_LIMITS.maxDurationSeconds);
  assertPerformanceMaximum(rawConfig.iterations, `${field}.config.iterations`, HARD_PERFORMANCE_LIMITS.maxTotalRequests);
  assertPerformanceMaximum(rawConfig.rampSteps, `${field}.config.rampSteps`, HARD_PERFORMANCE_LIMITS.maxTotalRequests);
  assertPerformanceMaximum(rawConfig.startConcurrency, `${field}.config.startConcurrency`, HARD_PERFORMANCE_LIMITS.maxConcurrency);
  assertPerformanceMaximum(rawConfig.concurrency, `${field}.config.concurrency`, HARD_PERFORMANCE_LIMITS.maxConcurrency);
  assertPerformanceMaximum(rawConfig.spikeMultiplier, `${field}.config.spikeMultiplier`, HARD_PERFORMANCE_LIMITS.maxConcurrency);
  assertPerformanceMaximum(rawConfig.durationSeconds, `${field}.config.durationSeconds`, HARD_PERFORMANCE_LIMITS.maxDurationSeconds);
  const config = normalizePerformanceConfig(value?.config, type);
  const safetyLimits = normalizePerformanceSafetyLimits(value?.safetyLimits);
  if (safetyLimits.maxTotalRequests > HARD_PERFORMANCE_LIMITS.maxTotalRequests) {
    fail(`${field}.safetyLimits.maxTotalRequests cannot exceed ${HARD_PERFORMANCE_LIMITS.maxTotalRequests}.`);
  }
  if (safetyLimits.maxConcurrency > HARD_PERFORMANCE_LIMITS.maxConcurrency) {
    fail(`${field}.safetyLimits.maxConcurrency cannot exceed ${HARD_PERFORMANCE_LIMITS.maxConcurrency}.`);
  }
  if (safetyLimits.maxDurationSeconds > HARD_PERFORMANCE_LIMITS.maxDurationSeconds) {
    fail(`${field}.safetyLimits.maxDurationSeconds cannot exceed ${HARD_PERFORMANCE_LIMITS.maxDurationSeconds}.`);
  }
  if ((type === 'stress' || type === 'ramp') && config.startConcurrency > config.concurrency) {
    fail(`${field}.config.startConcurrency cannot exceed config.concurrency.`);
  }
  const plannedRequests = performancePlannedRequests(type, config, safetyLimits);
  const effectiveConcurrency = performanceEffectiveConcurrency(type, config, safetyLimits);
  if (type === 'concurrency' && plannedRequests > safetyLimits.maxTotalRequests) {
    fail(`${field}.config.iterations multiplied by config.concurrency exceeds safetyLimits.maxTotalRequests.`);
  }
  if ((type === 'stress' || type === 'ramp') && plannedRequests > safetyLimits.maxTotalRequests) {
    fail(`${field}.config.iterations multiplied by config.rampSteps exceeds safetyLimits.maxTotalRequests.`);
  }
  if (!['diagnosis', 'concurrency', 'stress', 'ramp', 'soak'].includes(type) && config.iterations > safetyLimits.maxTotalRequests) {
    fail(`${field}.config.iterations exceeds safetyLimits.maxTotalRequests.`);
  }
  if (effectiveConcurrency > safetyLimits.maxConcurrency) {
    fail(`${field}.config.concurrency exceeds safetyLimits.maxConcurrency.`);
  }
  if (config.durationSeconds > safetyLimits.maxDurationSeconds) {
    fail(`${field}.config.durationSeconds exceeds safetyLimits.maxDurationSeconds.`);
  }
}

function assertPerformanceMaximum(value, field, max) {
  if (value == null) {
    return;
  }
  const number = Number(value);
  if (Number.isFinite(number) && number > max) {
    fail(`${field} cannot exceed ${max}.`);
  }
}

function performancePlannedRequests(type, config, safetyLimits) {
  if (type === DIAGNOSIS_TYPE) {
    return diagnosisPlannedRequestCount(config, safetyLimits);
  }
  if (type === 'soak') {
    return safetyLimits.maxTotalRequests;
  }
  if (type === 'concurrency') {
    return config.iterations * config.concurrency;
  }
  if (type === 'stress' || type === 'ramp') {
    return config.iterations * config.rampSteps;
  }
  return config.iterations;
}

function performanceEffectiveConcurrency(type, config, safetyLimits = {}) {
  if (type === DIAGNOSIS_TYPE) {
    return diagnosisEffectiveConcurrency(config, safetyLimits);
  }
  if (type === 'latency') {
    return 1;
  }
  if (type === 'spike') {
    return config.concurrency * config.spikeMultiplier;
  }
  if (type === 'stress' || type === 'ramp') {
    return Math.max(config.startConcurrency, config.concurrency);
  }
  return config.concurrency;
}

function assertSettingsPayload(value, field) {
  object(value || {}, field);
  if (value.updates != null) {
    assertSchemaFields('updateCheckOptions', value.updates, `${field}.updates`);
  }
  if (value.appearance != null) {
    assertSchemaFields('appearance', value.appearance, `${field}.appearance`);
    assertNoUnexpectedFields('appearance', value.appearance, `${field}.appearance`);
    assertOptionalNumberInSet(value.appearance.interfaceFontSize, `${field}.appearance.interfaceFontSize`, TYPOGRAPHY_FONT_SIZE_VALUES);
    assertOptionalNumberInSet(value.appearance.editorFontSize, `${field}.appearance.editorFontSize`, TYPOGRAPHY_FONT_SIZE_VALUES);
  }
  if (value.editor != null) {
    assertSchemaFields('editorSettings', value.editor, `${field}.editor`);
    assertNoUnexpectedFields('editorSettings', value.editor, `${field}.editor`);
  }
  if (value.tabs != null) {
    assertSchemaFields('tabSettings', value.tabs, `${field}.tabs`);
    assertNoUnexpectedFields('tabSettings', value.tabs, `${field}.tabs`);
  }
  if (value.modals != null) {
    assertSchemaFields('modalSettings', value.modals, `${field}.modals`);
    assertNoUnexpectedFields('modalSettings', value.modals, `${field}.modals`);
  }
  if (value.request != null) {
    object(value.request, `${field}.request`);
    assertAllowedObjectFields(value.request, `${field}.request`, [
      'caCertificatePath',
      'clientCertificates',
      'sslCertificateVerification'
    ]);
    assertSchemaFields('tlsRequestSettings', value.request, `${field}.request`);
    if (value.request.clientCertificates != null) {
      assertCertificates(value.request.clientCertificates, `${field}.request.clientCertificates`);
    }
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
    fail(`${field}.loadTestPolicy is no longer supported.`);
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
  const hasCollectionTarget = typeof value.collectionId === 'string' && value.collectionId.length > 0;
  const hasRunnerTarget = typeof value.runnerId === 'string' && value.runnerId.length > 0;
  if (!hasCollectionTarget && !hasRunnerTarget) {
    fail(`${field} must include collectionId or runnerId.`);
  }
  if (hasCollectionTarget && hasRunnerTarget) {
    fail(`${field} must target either collectionId or runnerId, not both.`);
  }
  if (hasCollectionTarget) {
    string(value.collectionId, `${field}.collectionId`, LIMITS.name);
  }
  if (hasRunnerTarget) {
    string(value.runnerId, `${field}.runnerId`, LIMITS.name);
  }
  string(value.requestId, `${field}.requestId`, LIMITS.name);
  if (hasRunnerTarget) {
    assertRunnerRequestPayload(value.request, `${field}.request`);
  } else {
    assertRequestPayload(value.request, `${field}.request`);
  }
  optionalString(value.folderId, `${field}.folderId`, LIMITS.name);
  optionalBoolean(value.createdUnsaved, `${field}.createdUnsaved`);
  if (value.collectionShell != null) {
    object(value.collectionShell, `${field}.collectionShell`);
    optionalString(value.collectionShell.id, `${field}.collectionShell.id`, LIMITS.name);
    optionalString(value.collectionShell.name, `${field}.collectionShell.name`, LIMITS.name);
    optionalString(value.collectionShell.description, `${field}.collectionShell.description`, LIMITS.value);
    assertAuthPayload(value.collectionShell.auth || { type: 'none' }, `${field}.collectionShell.auth`);
    assertScripts(value.collectionShell.scripts || {}, `${field}.collectionShell.scripts`);
    assertCertificates(value.collectionShell.certificates || [], `${field}.collectionShell.certificates`);
  }
  if (value.runnerShell != null) {
    object(value.runnerShell, `${field}.runnerShell`);
    optionalString(value.runnerShell.id, `${field}.runnerShell.id`, LIMITS.name);
    optionalString(value.runnerShell.name, `${field}.runnerShell.name`, LIMITS.name);
    optionalString(value.runnerShell.environmentId, `${field}.runnerShell.environmentId`, LIMITS.name);
    optionalBoolean(value.runnerShell.stopOnFailure, `${field}.runnerShell.stopOnFailure`);
    optionalBoolean(value.runnerShell.allowEnvironmentMutation, `${field}.runnerShell.allowEnvironmentMutation`);
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

function assertWorkspaceCollectionSavePayload(value, field = 'payload') {
  object(value, field);
  string(value.collectionId, `${field}.collectionId`, LIMITS.name);
  optionalBoolean(value.createdUnsaved, `${field}.createdUnsaved`);
  assertCollectionPayload(value.collection, `${field}.collection`);
  if (value.settings != null) {
    assertSettingsPayload(value.settings, `${field}.settings`);
  }
}

function assertWorkspaceCollectionSaveResultPayload(value, field = 'result') {
  object(value, field);
  assertCollectionPayload(value.collection, `${field}.collection`);
}

function assertWorkspaceFolderSavePayload(value, field = 'payload') {
  object(value, field);
  string(value.collectionId, `${field}.collectionId`, LIMITS.name);
  string(value.folderId, `${field}.folderId`, LIMITS.name);
  optionalBoolean(value.createdUnsaved, `${field}.createdUnsaved`);
  assertFolderPayload(value.folder, `${field}.folder`);
  if (value.collectionShell != null) {
    object(value.collectionShell, `${field}.collectionShell`);
    optionalString(value.collectionShell.id, `${field}.collectionShell.id`, LIMITS.name);
    optionalString(value.collectionShell.name, `${field}.collectionShell.name`, LIMITS.name);
    optionalString(value.collectionShell.description, `${field}.collectionShell.description`, LIMITS.value);
    assertAuthPayload(value.collectionShell.auth || { type: 'none' }, `${field}.collectionShell.auth`);
    assertScripts(value.collectionShell.scripts || {}, `${field}.collectionShell.scripts`);
    assertPairs(value.collectionShell.variables || [], `${field}.collectionShell.variables`);
    assertCertificates(value.collectionShell.certificates || [], `${field}.collectionShell.certificates`);
  }
  if (value.folderPath != null) {
    array(value.folderPath, `${field}.folderPath`, LIMITS.folderDepth).forEach((folder, index) => {
      const itemField = `${field}.folderPath[${index}]`;
      object(folder, itemField);
      optionalString(folder.id, `${itemField}.id`, LIMITS.name);
      optionalString(folder.name, `${itemField}.name`, LIMITS.name);
      optionalString(folder.description, `${itemField}.description`, LIMITS.value);
      if (folder.auth != null) {
        assertAuthPayload(folder.auth, `${itemField}.auth`);
      }
      if (folder.scripts != null) {
        assertScripts(folder.scripts, `${itemField}.scripts`);
      }
      if (folder.variables != null) {
        assertPairs(folder.variables, `${itemField}.variables`);
      }
    });
  }
  if (value.settings != null) {
    assertSettingsPayload(value.settings, `${field}.settings`);
  }
}

function assertWorkspaceFolderSaveResultPayload(value, field = 'result') {
  object(value, field);
  assertFolderPayload(value.folder, `${field}.folder`);
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

function assertCollectionRunResultPayload(value, field = 'result') {
  object(value, field);
  const size = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (size > LIMITS.resultJson) {
    fail(`${field} is too large to export.`);
  }
  assertSchemaFields('collectionRunResult', value, field);
  assertNoUnexpectedFields('collectionRunResult', value, field, [
    'capturePolicy',
    'collectionVariables',
    'cookies',
    'detailCaptureTruncated',
    'detailCaptureTruncationReason',
    'environment',
    'globals',
    'httpResponses',
    'id',
    'mutatedEnvironment',
    'resultPage',
    'resultStoreId',
    'storeBacked',
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
        'bodySha256',
        'finalUrl',
        'iteration',
        'localVariables',
        'messageScriptResults',
        'phase',
        'preRequestScriptResult',
        'responseBody',
        'responseBytes',
        'responseHeaders',
        'resultIndex',
        'schedulerLagMillis',
        'stageConcurrency',
        'stageIndex',
        'stageName',
        'timings',
        'tls',
        'testScriptResult'
      ]);
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
      if (result.localVariables != null) {
        assertPairs(result.localVariables, `${itemField}.localVariables`);
      }
      optionalNumber(result.resultIndex, `${itemField}.resultIndex`);
      optionalString(result.bodySha256, `${itemField}.bodySha256`, LIMITS.value);
      optionalString(result.finalUrl, `${itemField}.finalUrl`, LIMITS.url);
      optionalJsonObject(result.responseHeaders, `${itemField}.responseHeaders`, LIMITS.body);
      optionalJsonObject(result.timings, `${itemField}.timings`, LIMITS.body);
      optionalJsonObject(result.tls, `${itemField}.tls`, LIMITS.body);
    });
  }
  if (value.capturePolicy != null) {
    assertCapturePolicyPayload(value.capturePolicy, `${field}.capturePolicy`);
  }
  if (value.resultPage != null) {
    assertResultPagePayload(value.resultPage, `${field}.resultPage`);
  }
  optionalString(value.resultStoreId, `${field}.resultStoreId`, LIMITS.name);
  optionalString(value.id, `${field}.id`, LIMITS.name);
  optionalBoolean(value.storeBacked, `${field}.storeBacked`);
  optionalBoolean(value.detailCaptureTruncated, `${field}.detailCaptureTruncated`);
  optionalString(value.detailCaptureTruncationReason, `${field}.detailCaptureTruncationReason`, LIMITS.value);
  optionalNumber(value.httpResponses, `${field}.httpResponses`);
  if (value.environment != null) {
    assertEnvironmentPayload(value.environment, `${field}.environment`);
  }
  if (value.mutatedEnvironment != null) {
    assertEnvironmentPayload(value.mutatedEnvironment, `${field}.mutatedEnvironment`);
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
  assertNoUnexpectedFields('runnerConfig', value || {}, field, [
    'capturePolicy'
  ]);
  if (value?.capturePolicy != null) {
    assertCapturePolicyPayload(value.capturePolicy, `${field}.capturePolicy`);
  }
}

function assertRunnerProgressPayload(value, field = 'progress') {
  assertSchemaFields('runnerProgress', value, field);
  assertNoUnexpectedFields('runnerProgress', value, field);
}

function assertPerformanceProgressPayload(value, field = 'progress') {
  assertSchemaFields('performanceProgress', value, field);
  assertNoUnexpectedFields('performanceProgress', value, field);
}

function assertPerformanceResultPayload(value, field = 'result') {
  object(value, field);
  const size = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (size > LIMITS.resultJson) {
    fail(`${field} is too large to export.`);
  }
  assertSchemaFields('performanceResult', value, field);
  assertNoUnexpectedFields('performanceResult', value, field, [
    'capturePolicy',
    'config',
    'cookies',
    'detailCaptureTruncated',
    'detailCaptureTruncationReason',
    'environment',
    'mutatedEnvironment',
    'resultPage',
    'resultStoreId',
    'safetyLimits',
    'samples',
    'storeBacked',
    'summary'
  ]);
  if (value.summary != null) {
    optionalJsonObject(value.summary, `${field}.summary`, LIMITS.body);
  }
  if (value.config != null) {
    assertPerformanceConfigPayload(value.config, `${field}.config`);
  }
  if (value.safetyLimits != null) {
    assertPerformanceSafetyLimitsPayload(value.safetyLimits, `${field}.safetyLimits`);
  }
  if (value.capturePolicy != null) {
    assertCapturePolicyPayload(value.capturePolicy, `${field}.capturePolicy`);
  }
  if (value.resultPage != null) {
    assertResultPagePayload(value.resultPage, `${field}.resultPage`);
  }
  optionalString(value.resultStoreId, `${field}.resultStoreId`, LIMITS.name);
  optionalBoolean(value.storeBacked, `${field}.storeBacked`);
  optionalBoolean(value.detailCaptureTruncated, `${field}.detailCaptureTruncated`);
  optionalString(value.detailCaptureTruncationReason, `${field}.detailCaptureTruncationReason`, LIMITS.value);
  if (value.samples != null) {
    array(value.samples, `${field}.samples`, LIMITS.history).forEach((sample, index) => {
      assertPerformanceSamplePayload(sample, `${field}.samples[${index}]`);
    });
  }
  if (value.environment != null) {
    assertEnvironmentPayload(value.environment, `${field}.environment`);
  }
  if (value.mutatedEnvironment != null) {
    assertEnvironmentPayload(value.mutatedEnvironment, `${field}.mutatedEnvironment`);
  }
  if (value.cookies != null) {
    assertCookies(value.cookies, `${field}.cookies`);
  }
}

function assertPerformanceCalibrationResultPayload(value, field = 'result') {
  object(value, field);
  assertAllowedObjectFields(value, field, [
    'cancelled',
    'completedAt',
    'durationMillis',
    'endpoint',
    'id',
    'stages',
    'startedAt',
    'summary'
  ]);
  optionalString(value.id, `${field}.id`, LIMITS.name);
  optionalString(value.startedAt, `${field}.startedAt`, LIMITS.name);
  optionalString(value.completedAt, `${field}.completedAt`, LIMITS.name);
  optionalNumber(value.durationMillis, `${field}.durationMillis`);
  optionalBoolean(value.cancelled, `${field}.cancelled`);
  optionalString(value.endpoint, `${field}.endpoint`, LIMITS.url);
  if (value.summary != null) {
    object(value.summary, `${field}.summary`);
    assertAllowedObjectFields(value.summary, `${field}.summary`, [
      'averageLatencyMillis',
      'confidence',
      'completedRequests',
      'confirmationPasses',
      'confirmationTargetsTested',
      'edgeUpperBoundRequestsPerSecond',
      'failedRequests',
      'measurementVariationPercent',
      'notes',
      'p95EventLoopDelayMillis',
      'p95LatencyMillis',
      'p95StartLagMillis',
      'peakConcurrency',
      'peakRequestsPerSecond',
      'recommendedMaxRequestsPerSecond',
      'reliableTargetRequestsPerSecond',
      'repeatabilityPercent',
      'saturationConcurrency',
      'stabilityPercent',
      'sustainedRequestsPerSecond'
    ]);
    optionalNumber(value.summary.peakRequestsPerSecond, `${field}.summary.peakRequestsPerSecond`);
    optionalNumber(value.summary.peakConcurrency, `${field}.summary.peakConcurrency`);
    optionalNumber(value.summary.sustainedRequestsPerSecond, `${field}.summary.sustainedRequestsPerSecond`);
    optionalNumber(value.summary.reliableTargetRequestsPerSecond, `${field}.summary.reliableTargetRequestsPerSecond`);
    optionalNumber(value.summary.edgeUpperBoundRequestsPerSecond, `${field}.summary.edgeUpperBoundRequestsPerSecond`);
    optionalNumber(value.summary.measurementVariationPercent, `${field}.summary.measurementVariationPercent`);
    optionalNumber(value.summary.confirmationTargetsTested, `${field}.summary.confirmationTargetsTested`);
    optionalNumber(value.summary.recommendedMaxRequestsPerSecond, `${field}.summary.recommendedMaxRequestsPerSecond`);
    optionalNumber(value.summary.saturationConcurrency, `${field}.summary.saturationConcurrency`);
    optionalNumber(value.summary.stabilityPercent, `${field}.summary.stabilityPercent`);
    optionalNumber(value.summary.repeatabilityPercent, `${field}.summary.repeatabilityPercent`);
    optionalString(value.summary.confidence, `${field}.summary.confidence`, LIMITS.short);
    optionalNumber(value.summary.averageLatencyMillis, `${field}.summary.averageLatencyMillis`);
    optionalNumber(value.summary.p95LatencyMillis, `${field}.summary.p95LatencyMillis`);
    optionalNumber(value.summary.p95StartLagMillis, `${field}.summary.p95StartLagMillis`);
    optionalNumber(value.summary.p95EventLoopDelayMillis, `${field}.summary.p95EventLoopDelayMillis`);
    optionalNumber(value.summary.completedRequests, `${field}.summary.completedRequests`);
    optionalNumber(value.summary.failedRequests, `${field}.summary.failedRequests`);
    optionalNumber(value.summary.confirmationPasses, `${field}.summary.confirmationPasses`);
    if (value.summary.notes != null) {
      assertStringArray(value.summary.notes, `${field}.summary.notes`, 16, LIMITS.value);
    }
  }
  if (value.stages != null) {
    array(value.stages, `${field}.stages`, 64).forEach((stage, index) => {
      assertPerformanceCalibrationStagePayload(stage, `${field}.stages[${index}]`);
    });
  }
}

function assertPerformanceCalibrationStagePayload(value, field) {
  object(value, field);
  assertAllowedObjectFields(value, field, [
    'averageLatencyMillis',
    'averageStartLagMillis',
    'accepted',
    'completedRequests',
    'completionRatio',
    'confirmationCandidateRank',
    'confirmationPass',
    'confirmationPasses',
    'confirmationTargetRequestsPerSecond',
    'confirmationVariationPercent',
    'confirmed',
    'concurrency',
    'durationMillis',
    'errorRate',
    'eventLoopUtilizationPercent',
    'failedRequests',
    'failureReasons',
    'intervalCount',
    'maxIntervalRequestsPerSecond',
    'maxInFlightLimit',
    'maxInFlightRequests',
    'maxStartBacklog',
    'medianIntervalRequestsPerSecond',
    'minIntervalRequestsPerSecond',
    'mode',
    'name',
    'onTimeCompletedRequests',
    'p95EventLoopDelayMillis',
    'p95LatencyMillis',
    'p95StartLagMillis',
    'p99LatencyMillis',
    'requestedRequests',
    'requestsPerSecond',
    'startedRequests',
    'stabilityPercent',
    'targetDurationMillis',
    'targetRequests',
    'targetRequestsPerSecond',
    'achievedTargetRatio'
  ]);
  optionalString(value.name, `${field}.name`, LIMITS.short);
  optionalString(value.mode, `${field}.mode`, LIMITS.short);
  optionalNumber(value.concurrency, `${field}.concurrency`);
  optionalNumber(value.requestedRequests, `${field}.requestedRequests`);
  optionalNumber(value.targetRequests, `${field}.targetRequests`);
  optionalNumber(value.targetRequestsPerSecond, `${field}.targetRequestsPerSecond`);
  optionalNumber(value.startedRequests, `${field}.startedRequests`);
  optionalNumber(value.completedRequests, `${field}.completedRequests`);
  optionalNumber(value.onTimeCompletedRequests, `${field}.onTimeCompletedRequests`);
  optionalNumber(value.failedRequests, `${field}.failedRequests`);
  optionalNumber(value.durationMillis, `${field}.durationMillis`);
  optionalNumber(value.targetDurationMillis, `${field}.targetDurationMillis`);
  optionalNumber(value.requestsPerSecond, `${field}.requestsPerSecond`);
  optionalNumber(value.completionRatio, `${field}.completionRatio`);
  optionalNumber(value.achievedTargetRatio, `${field}.achievedTargetRatio`);
  optionalNumber(value.errorRate, `${field}.errorRate`);
  optionalNumber(value.averageLatencyMillis, `${field}.averageLatencyMillis`);
  optionalNumber(value.p95LatencyMillis, `${field}.p95LatencyMillis`);
  optionalNumber(value.p99LatencyMillis, `${field}.p99LatencyMillis`);
  optionalNumber(value.averageStartLagMillis, `${field}.averageStartLagMillis`);
  optionalNumber(value.p95StartLagMillis, `${field}.p95StartLagMillis`);
  optionalNumber(value.intervalCount, `${field}.intervalCount`);
  optionalNumber(value.medianIntervalRequestsPerSecond, `${field}.medianIntervalRequestsPerSecond`);
  optionalNumber(value.minIntervalRequestsPerSecond, `${field}.minIntervalRequestsPerSecond`);
  optionalNumber(value.maxIntervalRequestsPerSecond, `${field}.maxIntervalRequestsPerSecond`);
  optionalNumber(value.stabilityPercent, `${field}.stabilityPercent`);
  optionalNumber(value.eventLoopUtilizationPercent, `${field}.eventLoopUtilizationPercent`);
  optionalNumber(value.p95EventLoopDelayMillis, `${field}.p95EventLoopDelayMillis`);
  optionalNumber(value.maxInFlightRequests, `${field}.maxInFlightRequests`);
  optionalNumber(value.maxInFlightLimit, `${field}.maxInFlightLimit`);
  optionalNumber(value.maxStartBacklog, `${field}.maxStartBacklog`);
  optionalNumber(value.confirmationTargetRequestsPerSecond, `${field}.confirmationTargetRequestsPerSecond`);
  optionalNumber(value.confirmationPass, `${field}.confirmationPass`);
  optionalNumber(value.confirmationPasses, `${field}.confirmationPasses`);
  optionalNumber(value.confirmationCandidateRank, `${field}.confirmationCandidateRank`);
  optionalNumber(value.confirmationVariationPercent, `${field}.confirmationVariationPercent`);
  optionalBoolean(value.accepted, `${field}.accepted`);
  optionalBoolean(value.confirmed, `${field}.confirmed`);
  if (value.failureReasons != null) {
    assertStringArray(value.failureReasons, `${field}.failureReasons`, 16, LIMITS.value);
  }
}

function assertPerformanceSamplePayload(value, field) {
  object(value, field);
  assertAllowedObjectFields(value, field, [
    'afterResponseScriptResult',
    'bodySha256',
    'error',
    'finalUrl',
    'folderName',
    'iteration',
    'localVariables',
    'messageScriptResults',
    'passed',
    'phase',
    'preRequestScriptResult',
    'requestId',
    'requestDisplayName',
    'requestMethod',
    'requestName',
    'requestUrl',
    'responseBody',
    'responseBytes',
    'responseHeaders',
    'resultIndex',
    'runnerIteration',
    'runnerIterations',
    'schedulerLagMillis',
    'startedAt',
    'stageConcurrency',
    'stageIndex',
    'stageName',
    'statusCode',
    'durationMillis',
    'testScriptResult',
    'timings',
    'tls'
  ]);
  optionalNumber(value.iteration, `${field}.iteration`);
  optionalNumber(value.resultIndex, `${field}.resultIndex`);
  optionalString(value.startedAt, `${field}.startedAt`, LIMITS.name);
  optionalString(value.requestId, `${field}.requestId`, LIMITS.name);
  optionalString(value.requestName, `${field}.requestName`, LIMITS.name);
  optionalString(value.requestDisplayName, `${field}.requestDisplayName`, LIMITS.name);
  optionalString(value.requestMethod, `${field}.requestMethod`, LIMITS.short);
  optionalString(value.requestUrl, `${field}.requestUrl`, LIMITS.url);
  optionalString(value.finalUrl, `${field}.finalUrl`, LIMITS.url);
  optionalString(value.folderName, `${field}.folderName`, LIMITS.name);
  optionalNumber(value.runnerIteration, `${field}.runnerIteration`);
  optionalNumber(value.runnerIterations, `${field}.runnerIterations`);
  optionalString(value.phase, `${field}.phase`, LIMITS.short);
  optionalString(value.stageName, `${field}.stageName`, LIMITS.short);
  optionalNumber(value.stageIndex, `${field}.stageIndex`);
  optionalNumber(value.stageConcurrency, `${field}.stageConcurrency`);
  optionalNumber(value.statusCode, `${field}.statusCode`);
  optionalNumber(value.durationMillis, `${field}.durationMillis`);
  optionalNumber(value.schedulerLagMillis, `${field}.schedulerLagMillis`);
  optionalString(value.responseBody, `${field}.responseBody`, LIMITS.value);
  optionalString(value.bodySha256, `${field}.bodySha256`, LIMITS.value);
  optionalNumber(value.responseBytes, `${field}.responseBytes`);
  optionalJsonObject(value.responseHeaders, `${field}.responseHeaders`, LIMITS.body);
  optionalJsonObject(value.timings, `${field}.timings`, LIMITS.body);
  optionalJsonObject(value.tls, `${field}.tls`, LIMITS.body);
  optionalBoolean(value.passed, `${field}.passed`);
  optionalString(value.error, `${field}.error`, LIMITS.value);
  if (value.preRequestScriptResult != null) {
    assertScriptResult(value.preRequestScriptResult, `${field}.preRequestScriptResult`);
  }
  if (value.testScriptResult != null) {
    assertScriptResult(value.testScriptResult, `${field}.testScriptResult`);
  }
  if (value.afterResponseScriptResult != null) {
    assertScriptResult(value.afterResponseScriptResult, `${field}.afterResponseScriptResult`);
  }
  if (value.messageScriptResults != null) {
    array(value.messageScriptResults, `${field}.messageScriptResults`, LIMITS.pairs).forEach((scriptResult, scriptIndex) => {
      assertScriptResult(scriptResult, `${field}.messageScriptResults[${scriptIndex}]`);
    });
  }
  if (value.localVariables != null) {
    assertPairs(value.localVariables, `${field}.localVariables`);
  }
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
    'timings',
    'tls',
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
  optionalJsonObject(value.timings, `${field}.timings`, LIMITS.body);
  optionalJsonObject(value.tls, `${field}.tls`, LIMITS.body);
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
  optionalNumber(value.runnerCount, `${field}.runnerCount`);
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
  if (value.performanceTest != null) {
    assertPerformanceTestPayload(value.performanceTest, `${field}.performanceTest`);
  }
  if (value.performanceResult != null) {
    assertPerformanceResultPayload(value.performanceResult, `${field}.performanceResult`);
  }
}

function assertOAuthProgressPayload(value, field = 'progress') {
  assertSchemaFields('oauthProgress', value, field);
  assertNoUnexpectedFields('oauthProgress', value, field);
}

function assertExportFormat(value, field = 'format') {
  try {
    oneOf(value, ['json', 'csv', 'html'], field);
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

function assertPerformanceExportFormat(value, field = 'format') {
  try {
    oneOf(value || 'postmeter', 'performanceExportFormats', field);
  } catch (error) {
    fail(error.message);
  }
}

function assertHtmlReportOptionsPayload(value, field = 'htmlReportOptions') {
  if (value == null) {
    return;
  }
  assertAllowedObjectFields(value, field, [
    'includeRequestResults',
    'includeRequestDetails',
    'theme'
  ]);
  optionalBoolean(value.includeRequestResults, `${field}.includeRequestResults`);
  optionalBoolean(value.includeRequestDetails, `${field}.includeRequestDetails`);
  if (value.theme != null) {
    try {
      oneOf(value.theme, ['light', 'dark'], `${field}.theme`);
    } catch (error) {
      fail(error.message);
    }
  }
}

function assertRuntimeId(value, field = 'id') {
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

function assertRunnerArray(values, field) {
  array(values, field, LIMITS.runners).forEach((runner, index) => {
    assertRunnerPayload(runner, `${field}[${index}]`);
  });
}

function assertPerformanceTestArray(values, field) {
  array(values, field, LIMITS.performanceTests).forEach((performanceTest, index) => {
    assertPerformanceTestPayload(performanceTest, `${field}[${index}]`);
  });
}

function assertRunnerRequestArray(values, field) {
  array(values, field, LIMITS.requestsPerLevel).forEach((request, index) => {
    assertRunnerRequestPayload(request, `${field}[${index}]`);
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
    for (const name of ['key', 'collectionId', 'runnerId', 'requestId', 'folderId']) {
      optionalString(tab[name], `${itemField}.${name}`, LIMITS.value);
    }
    optionalBoolean(tab.draft, `${itemField}.draft`);
    optionalBoolean(tab.runnerRequest, `${itemField}.runnerRequest`);
    optionalBoolean(tab.dirty, `${itemField}.dirty`);
    optionalBoolean(tab.createdUnsaved, `${itemField}.createdUnsaved`);
    optionalString(tab.snapshot, `${itemField}.snapshot`, LIMITS.body);
    if (tab.currentState != null) {
      assertRequestPayload(tab.currentState, `${itemField}.currentState`);
    }
  });
}

function assertSessionCollectionTabs(values, field) {
  array(values, field, MAX_OPEN_TABS).forEach((tab, index) => {
    const itemField = `${field}[${index}]`;
    object(tab, itemField);
    optionalString(tab.key, `${itemField}.key`, LIMITS.value);
    optionalString(tab.collectionId, `${itemField}.collectionId`, LIMITS.value);
    optionalBoolean(tab.dirty, `${itemField}.dirty`);
    optionalBoolean(tab.createdUnsaved, `${itemField}.createdUnsaved`);
    optionalString(tab.snapshot, `${itemField}.snapshot`, LIMITS.body);
    if (tab.currentState != null) {
      assertCollectionPayload(tab.currentState, `${itemField}.currentState`);
    }
  });
}

function assertSessionFolderTabs(values, field) {
  array(values, field, MAX_OPEN_TABS).forEach((tab, index) => {
    const itemField = `${field}[${index}]`;
    object(tab, itemField);
    optionalString(tab.key, `${itemField}.key`, LIMITS.value);
    optionalString(tab.collectionId, `${itemField}.collectionId`, LIMITS.value);
    optionalString(tab.folderId, `${itemField}.folderId`, LIMITS.value);
    optionalBoolean(tab.dirty, `${itemField}.dirty`);
    optionalBoolean(tab.createdUnsaved, `${itemField}.createdUnsaved`);
    optionalString(tab.snapshot, `${itemField}.snapshot`, LIMITS.body);
    if (tab.currentState != null) {
      assertFolderPayload(tab.currentState, `${itemField}.currentState`);
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

function assertSessionRunnerTabs(values, field) {
  array(values, field, MAX_OPEN_TABS).forEach((tab, index) => {
    const itemField = `${field}[${index}]`;
    object(tab, itemField);
    optionalString(tab.key, `${itemField}.key`, LIMITS.value);
    optionalString(tab.runnerId, `${itemField}.runnerId`, LIMITS.value);
    optionalBoolean(tab.dirty, `${itemField}.dirty`);
    optionalBoolean(tab.createdUnsaved, `${itemField}.createdUnsaved`);
    optionalString(tab.snapshot, `${itemField}.snapshot`, LIMITS.body);
    if (tab.currentState != null) {
      assertRunnerPayload(tab.currentState, `${itemField}.currentState`);
    }
  });
}

function assertSessionPerformanceTabs(values, field) {
  array(values, field, MAX_OPEN_TABS).forEach((tab, index) => {
    const itemField = `${field}[${index}]`;
    object(tab, itemField);
    optionalString(tab.key, `${itemField}.key`, LIMITS.value);
    optionalString(tab.performanceTestId, `${itemField}.performanceTestId`, LIMITS.value);
    optionalBoolean(tab.dirty, `${itemField}.dirty`);
    optionalBoolean(tab.createdUnsaved, `${itemField}.createdUnsaved`);
    optionalString(tab.snapshot, `${itemField}.snapshot`, LIMITS.body);
    if (tab.currentState != null) {
      assertPerformanceTestPayload(tab.currentState, `${itemField}.currentState`);
    }
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
    assertAuthPayload(folder.auth || { type: 'none' }, `${itemField}.auth`);
    assertScripts(folder.scripts || {}, `${itemField}.scripts`);
    assertPairs(folder.variables || [], `${itemField}.variables`);
    assertRequestArray(folder.requests || [], `${itemField}.requests`);
    assertFolderArray(folder.folders || [], `${itemField}.folders`, depth + 1);
  });
}

function assertFolderPayload(folder, field = 'folder') {
  object(folder, field);
  assertSchemaFields('folder', folder, field);
  optionalJsonObject(folder.postman, `${field}.postman`, LIMITS.body);
  assertAuthPayload(folder.auth || { type: 'none' }, `${field}.auth`);
  assertScripts(folder.scripts || {}, `${field}.scripts`);
  assertPairs(folder.variables || [], `${field}.variables`);
  assertRequestArray(folder.requests || [], `${field}.requests`);
  assertFolderArray(folder.folders || [], `${field}.folders`, 1);
}

function assertPairs(values, field) {
  array(values, field, LIMITS.pairs).forEach((pair, index) => {
    const itemField = `${field}[${index}]`;
    assertSchemaFields('keyValue', pair, itemField);
  });
}

function assertScripts(value, field) {
  assertSchemaFields('scripts', value, field);
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

function assertOptionalNumberInRange(value, field, min, max) {
  if (value == null) {
    return;
  }
  number(value, field);
  const numeric = Number(value);
  if (numeric < min || numeric > max) {
    fail(`${field} must be between ${min} and ${max}.`);
  }
}

function assertOptionalNumberInSet(value, field, allowedValues) {
  if (value == null) {
    return;
  }
  number(value, field);
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || !allowedValues.includes(numeric)) {
    fail(`${field} must be one of ${allowedValues.join(', ')}.`);
  }
}

function assertOptionalInteger(value, field, min) {
  if (value == null) {
    return;
  }
  number(value, field);
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < min) {
    fail(`${field} must be an integer greater than or equal to ${min}.`);
  }
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
  assertHtmlReportOptionsPayload,
  assertOAuthProgressPayload,
  assertOptionalEnvironmentPayload,
  assertPerformanceCalibrationResultPayload,
  assertPerformanceConfigPayload,
  assertPerformanceExportFormat,
  assertPerformanceProgressPayload,
  assertPerformanceResultPayload,
  assertPerformanceSafetyLimitsPayload,
  assertPerformanceTestPayload,
  assertRunnerConfigPayload,
  assertRunnerProgressPayload,
  assertSessionPayload,
  assertExternalUrlPayload,
  assertFileOperationResultPayload,
  assertResponsePayload,
  assertRequestPayload,
  assertRuntimeId,
  assertRunnerPayload,
  assertUpdateCheckOptionsPayload,
  assertWorkspaceCollectionSavePayload,
  assertWorkspaceCollectionSaveResultPayload,
  assertWorkspaceEnvironmentSavePayload,
  assertWorkspaceEnvironmentSaveResultPayload,
  assertWorkspaceFolderSavePayload,
  assertWorkspaceFolderSaveResultPayload,
  assertWorkspaceLoadResultPayload,
  assertWorkspaceRequestSavePayload,
  assertWorkspaceRequestSaveResultPayload,
  assertWorkspaceSettingsSavePayload,
  assertWorkspaceSettingsSaveResultPayload,
  assertWorkspacePayload
};
