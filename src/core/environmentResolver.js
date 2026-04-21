const VARIABLE_PATTERN = /\{\{\s*([A-Za-z0-9_.-]+)\s*}}/g;

function resolveEnvironmentValue(value, environment) {
  if (value == null) {
    return '';
  }
  if (!environment) {
    return String(value);
  }

  const variables = new Map();
  for (const variable of environment.variables || []) {
    if (variable.enabled !== false && variable.key && variable.key.trim()) {
      variables.set(variable.key.trim(), variable.value ?? '');
    }
  }

  return String(value).replace(VARIABLE_PATTERN, (match, name) => (
    variables.has(name) ? variables.get(name) : match
  ));
}

module.exports = { resolveEnvironmentValue };
