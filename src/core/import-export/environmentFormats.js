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
  if (!['postmeter', 'postman', 'dotenv'].includes(format)) {
    throw new Error('Unsupported environment export format.');
  }
  if (format === 'dotenv') {
    return exportEnvironmentToDotenv(environment);
  }
  if (format === 'postman') {
    return JSON.stringify(exportPostmanEnvironment(environment), null, 2);
  }
  return JSON.stringify(exportEnvironmentDocument(environment), null, 2);
}

function exportEnvironmentToDotenv(environment) {
  const normalized = environmentModel(environment);
  return `${normalized.variables
    .map((variable) => `${String(variable.key || '')}=${dotenvValue(variable.value)}`)
    .join('\n')}\n`;
}

function dotenvValue(value) {
  const text = value == null ? '' : String(value);
  return text && /^[A-Za-z0-9_./:@%+=,-]+$/u.test(text)
    ? text
    : JSON.stringify(text);
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
  const text = String(content || '');
  if (!text.trimStart().startsWith('{')) {
    return importEnvironmentFromDotenv(text);
  }
  let document;
  try {
    document = JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse environment JSON: ${error.message}`);
  }
  return importEnvironmentDocument(document);
}

function importEnvironmentFromDotenv(content) {
  const variables = [];
  for (const rawLine of String(content || '').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const assignment = line.startsWith('export ') ? line.slice(7).trimStart() : line;
    const separator = assignment.indexOf('=');
    if (separator < 1) {
      continue;
    }
    const key = assignment.slice(0, separator).trim();
    if (!key) {
      continue;
    }
    variables.push({
      enabled: true,
      key,
      value: dotenvImportedValue(assignment.slice(separator + 1))
    });
  }
  return environmentModel({ name: 'Imported Environment', variables });
}

function dotenvImportedValue(rawValue) {
  const value = String(rawValue || '').trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value.replace(/\s+#.*$/u, '').trim();
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
  exportEnvironmentToDotenv,
  exportEnvironmentToJson,
  importEnvironmentDocument,
  importEnvironmentFromDotenv,
  importEnvironmentFromText,
  looksLikePostmanEnvironment
};
