const { environmentModel } = require('../workspace/models');
const { assertEnvironmentPayload } = require('../contracts/ipcValidation');

const ENVIRONMENT_FORMAT = 'postmeter.environment.v1';

function exportEnvironmentDocument(environment) {
  assertEnvironmentPayload(environment);
  return {
    format: ENVIRONMENT_FORMAT,
    exportedAt: new Date().toISOString(),
    environment: environmentModel(environment)
  };
}

function exportEnvironmentToJson(environment, format = 'postmeter') {
  if (!['postmeter', 'postman'].includes(format)) {
    throw new Error('Unsupported environment export format.');
  }
  if (format === 'postman') {
    return JSON.stringify(exportPostmanEnvironment(environment), null, 2);
  }
  return JSON.stringify(exportEnvironmentDocument(environment), null, 2);
}

function exportPostmanEnvironment(environment) {
  const normalized = environmentModel(environment);
  return {
    id: normalized.id,
    name: normalized.name,
    values: normalized.variables.map((variable) => ({
      key: variable.key || '',
      value: variable.value || '',
      type: 'default',
      enabled: variable.enabled !== false
    })),
    _postman_variable_scope: 'environment',
    _postman_exported_at: new Date().toISOString(),
    _postman_exported_using: 'PostMeter'
  };
}

function importEnvironmentFromText(content) {
  let document;
  try {
    document = JSON.parse(String(content || ''));
  } catch (error) {
    throw new Error(`Failed to parse environment JSON: ${error.message}`);
  }
  return importEnvironmentDocument(document);
}

function importEnvironmentDocument(document) {
  const candidate = document?.format === ENVIRONMENT_FORMAT
    ? document.environment
    : looksLikePostmanEnvironment(document)
      ? postmanEnvironmentToEnvironment(document)
      : document?.environment || document;
  assertEnvironmentPayload(candidate);
  return environmentModel(candidate);
}

function looksLikePostmanEnvironment(document) {
  return Boolean(document && Array.isArray(document.values) && document._postman_variable_scope === 'environment');
}

function postmanEnvironmentToEnvironment(document) {
  return {
    id: document.id,
    name: document.name || 'Imported Environment',
    variables: (document.values || []).map((item) => ({
      enabled: item?.enabled !== false && item?.disabled !== true,
      key: item?.key == null ? '' : String(item.key),
      value: item?.value == null ? '' : String(item.value)
    }))
  };
}

module.exports = {
  ENVIRONMENT_FORMAT,
  exportEnvironmentDocument,
  exportEnvironmentToJson,
  importEnvironmentDocument,
  importEnvironmentFromText,
  looksLikePostmanEnvironment
};
