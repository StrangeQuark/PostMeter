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

function runtimeEnvironment(collectionVariables = [], environment = null, localVariables = []) {
  const merged = [];
  mergeVariables(merged, collectionVariables, false);
  mergeVariables(merged, environment?.variables || [], true);
  mergeVariables(merged, localVariables || [], true);
  return {
    id: environment?.id || 'runtime',
    name: environment?.name || 'Runtime',
    variables: merged
  };
}

function mergeVariables(target, source, override) {
  for (const variable of source || []) {
    if (!variable || variable.enabled === false || !String(variable.key || '').trim()) {
      continue;
    }
    const key = String(variable.key).trim();
    const existing = target.find((item) => item.key === key);
    if (existing) {
      if (override) {
        existing.value = variable.value ?? '';
        existing.enabled = true;
      }
      continue;
    }
    target.push({
      enabled: true,
      key,
      value: variable.value ?? ''
    });
  }
}

function getVariable(variables, key) {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) {
    return undefined;
  }
  const variable = (variables || []).find((item) => item.enabled !== false && item.key === normalizedKey);
  return variable ? variable.value ?? '' : undefined;
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
  unsetVariable
};
