const { resolveDynamicVariable } = require('./dynamicVariables');
const { variableObservableValue } = require('./variableScope');

const VARIABLE_PATTERN = /\{\{\s*([$A-Za-z0-9_.-]+)\s*}}|\$\{\s*([$A-Za-z0-9_.-]+)\s*}/g;

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
      variables.set(variable.key.trim(), variableObservableValue(variable));
    }
  }

  return String(value).replace(VARIABLE_PATTERN, (match, postmanName, dollarName) => {
    const name = postmanName || dollarName;
    if (variables.has(name)) {
      return variables.get(name);
    }
    const dynamicValue = resolveDynamicVariable(name);
    return dynamicValue == null ? match : String(dynamicValue);
  });
}

module.exports = { resolveEnvironmentValue };
