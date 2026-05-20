const DIAGNOSTIC_LEVELS = Object.freeze(['debug', 'info', 'warn', 'error']);
const REQUEST_RESPONSE_LOGGING_FIELDS = Object.freeze([
  'urls',
  'headers',
  'cookies',
  'bodies',
  'protocolMessages',
  'scriptConsole',
  'payloadIdentifiers'
]);

function defaultDiagnosticsSettings() {
  return {
    logging: {
      enabled: true,
      level: 'info'
    },
    requestResponseLogging: Object.fromEntries(REQUEST_RESPONSE_LOGGING_FIELDS.map((field) => [field, false]))
  };
}

function normalizeDiagnosticsSettings(settings) {
  const source = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? settings
    : {};
  const defaults = defaultDiagnosticsSettings();
  const level = String(source.logging?.level || defaults.logging.level).trim().toLowerCase();
  const requestResponseSource = source.requestResponseLogging && typeof source.requestResponseLogging === 'object' && !Array.isArray(source.requestResponseLogging)
    ? source.requestResponseLogging
    : {};
  return {
    logging: {
      enabled: source.logging?.enabled !== false,
      level: DIAGNOSTIC_LEVELS.includes(level) ? level : defaults.logging.level
    },
    requestResponseLogging: Object.fromEntries(REQUEST_RESPONSE_LOGGING_FIELDS.map((field) => [
      field,
      requestResponseSource[field] === true
    ]))
  };
}

module.exports = {
  DIAGNOSTIC_LEVELS,
  REQUEST_RESPONSE_LOGGING_FIELDS,
  defaultDiagnosticsSettings,
  normalizeDiagnosticsSettings
};
