function cloneEnvironment(environment) {
  if (!environment) {
    return null;
  }
  return {
    ...environment,
    variables: cloneVariables(environment.variables)
  };
}

function cloneVariables(variables) {
  return Array.isArray(variables) ? variables.map((variable) => ({ ...variable })) : [];
}

function runtimeEnvironment(collectionVariables = [], environment = null, localVariables = [], options = {}) {
  const merged = [];
  mergeVariables(merged, options.globals || [], false);
  mergeVariables(merged, collectionVariables, false);
  mergeVariables(merged, environment?.variables || [], true);
  mergeVariables(merged, options.iterationData || [], true);
  mergeVariables(merged, localVariables || [], true);
  return {
    id: environment?.id || 'runtime',
    name: environment?.name || 'Runtime',
    variables: merged
  };
}

function mergeVariables(target, source, override) {
  if (!Array.isArray(source)) {
    return;
  }
  for (const variable of source || []) {
    if (!variable || variable.enabled === false || !String(variable.key || '').trim()) {
      continue;
    }
    const key = String(variable.key).trim();
    const existing = target.find((item) => item.key === key);
    if (existing) {
      if (override) {
        existing.value = variableObservableValue(variable);
        existing.enabled = true;
      }
      continue;
    }
    target.push({
      enabled: true,
      key,
      value: variableObservableValue(variable)
    });
  }
}

function getVariable(variables, key) {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) {
    return undefined;
  }
  const variable = (variables || []).find((item) => item.enabled !== false && item.key === normalizedKey);
  return variable ? variableObservableValue(variable) : undefined;
}

function setVariable(variables, key, value, options = {}) {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) {
    return;
  }
  const existing = (variables || []).find((item) => item.key === normalizedKey);
  if (existing) {
    existing.value = value == null ? '' : String(value);
    existing.enabled = true;
    return;
  }
  variables.push({
    enabled: true,
    key: normalizedKey,
    value: value == null ? '' : String(value)
  });
}

function unsetVariable(variables, key) {
  const normalizedKey = String(key || '').trim();
  const index = (variables || []).findIndex((item) => item.key === normalizedKey);
  if (index >= 0) {
    variables.splice(index, 1);
  }
}

function variableObservableValue(variable) {
  if (!variable || typeof variable !== 'object') {
    return '';
  }
  const value = variable.value
    ?? variable.currentValue
    ?? variable.current
    ?? variable.initialValue
    ?? variable.initial
    ?? '';
  return value == null ? '' : String(value);
}

function applyExtractedVariables(environment, variables) {
  if (!environment || !Array.isArray(variables)) {
    return;
  }
  environment.variables ||= [];
  for (const variable of variables) {
    setVariable(environment.variables, variable.key, variable.value);
  }
}

module.exports = {
  applyExtractedVariables,
  cloneEnvironment,
  cloneVariables,
  getVariable,
  runtimeEnvironment,
  setVariable,
  unsetVariable,
  variableObservableValue
};
