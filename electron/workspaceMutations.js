const { walkRequests } = require('../src/core/models');

function updateWorkspaceRequestAuth(workspace, requestId, auth) {
  for (const collection of workspace.collections || []) {
    walkRequests(collection, (request) => {
      if (request.id === requestId) {
        request.auth = auth;
      }
    });
  }
}

function findWorkspaceRequestContext(workspace, requestId) {
  for (const collection of workspace.collections || []) {
    const request = findRequestInCollection(collection, requestId);
    if (request) {
      return { collection, request };
    }
  }
  return null;
}

function findRequestInCollection(collection, requestId) {
  let match = null;
  walkRequests(collection, (request) => {
    if (!match && request.id === requestId) {
      match = request;
    }
  });
  return match;
}

function applyScriptVariableMutationsToWorkspace(workspace, { collection, request, environment, collectionVariables, localVariables }) {
  applyEnvironmentVariablesToWorkspace(workspace, environment);
  if (collection && Array.isArray(collectionVariables)) {
    collection.variables = clonePairs(collectionVariables);
  }
  if (request && Array.isArray(localVariables)) {
    request.variables = clonePairs(localVariables);
  }
}

function applyCollectionRunMutationsToWorkspace(workspace, result) {
  applyEnvironmentVariablesToWorkspace(workspace, result.environment);
  const collection = (workspace.collections || []).find((candidate) => candidate.id === result.collectionId);
  if (!collection) {
    return;
  }
  if (Array.isArray(result.collectionVariables)) {
    collection.variables = clonePairs(result.collectionVariables);
  }
  for (const item of result.results || []) {
    const request = item.requestId ? findRequestInCollection(collection, item.requestId) : null;
    if (request && Array.isArray(item.localVariables)) {
      request.variables = clonePairs(item.localVariables);
    }
  }
}

function applyEnvironmentVariablesToWorkspace(workspace, environment) {
  if (!environment?.id || environment.id === 'runtime' || !Array.isArray(environment.variables)) {
    return;
  }
  const workspaceEnvironment = (workspace.environments || []).find((candidate) => candidate.id === environment.id);
  if (workspaceEnvironment) {
    workspaceEnvironment.variables = clonePairs(environment.variables);
  }
}

function clonePairs(pairs) {
  return Array.isArray(pairs) ? pairs.map((pair) => ({ ...pair })) : [];
}

module.exports = {
  applyCollectionRunMutationsToWorkspace,
  applyScriptVariableMutationsToWorkspace,
  findWorkspaceRequestContext,
  updateWorkspaceRequestAuth
};
