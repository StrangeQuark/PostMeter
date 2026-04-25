const { walkRequests } = require('../src/core/models');

function cloneJson(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

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

function applyRequestSaveToWorkspace(workspace, payload) {
  const nextWorkspace = {
    ...workspace,
    collections: Array.isArray(workspace?.collections) ? [...workspace.collections] : []
  };
  const requestId = payload?.requestId || payload?.request?.id || '';
  const collectionId = payload?.collectionId || '';
  let collectionIndex = nextWorkspace.collections.findIndex((collection) => collection.id === collectionId);
  let collection = collectionIndex >= 0 ? cloneJson(nextWorkspace.collections[collectionIndex]) : null;

  if (!collection) {
    if (!payload?.collectionShell) {
      throw new Error(`Collection "${collectionId}" was not found.`);
    }
    collection = {
      id: collectionId,
      name: payload.collectionShell.name || 'Untitled Collection',
      description: payload.collectionShell.description || '',
      certificates: Array.isArray(payload.collectionShell.certificates) ? cloneJson(payload.collectionShell.certificates) : [],
      variables: Array.isArray(payload.collectionVariables) ? clonePairs(payload.collectionVariables) : [],
      requests: [],
      folders: []
    };
    collectionIndex = nextWorkspace.collections.length;
  }

  if (!replaceRequestInCollection(collection, requestId, payload.request)) {
    const targetFolder = ensureFolderPath(collection, payload.folderPath || []);
    targetFolder.requests ||= [];
    targetFolder.requests.push(cloneJson(payload.request));
  }

  if (Array.isArray(payload.collectionVariables)) {
    collection.variables = clonePairs(payload.collectionVariables);
  }

  nextWorkspace.collections[collectionIndex] = collection;

  if (Array.isArray(payload.cookies)) {
    nextWorkspace.cookies = cloneJson(payload.cookies);
  }

  if (payload?.settings && typeof payload.settings === 'object') {
    nextWorkspace.settings = cloneJson(payload.settings);
  }

  return nextWorkspace;
}

function applyEnvironmentSaveToWorkspace(workspace, payload) {
  const nextWorkspace = {
    ...workspace,
    environments: Array.isArray(workspace?.environments) ? [...workspace.environments] : []
  };
  const environmentId = payload?.environmentId || payload?.environment?.id || '';
  const environmentIndex = nextWorkspace.environments.findIndex((environment) => environment.id === environmentId);
  if (environmentIndex >= 0) {
    nextWorkspace.environments[environmentIndex] = cloneJson(payload.environment);
  } else {
    nextWorkspace.environments.push(cloneJson(payload.environment));
  }
  if (payload?.settings && typeof payload.settings === 'object') {
    nextWorkspace.settings = cloneJson(payload.settings);
  }
  return nextWorkspace;
}

function applyWorkspaceSettingsSaveToWorkspace(workspace, settings) {
  return {
    ...workspace,
    settings: cloneJson(settings || {})
  };
}

function replaceRequestInCollection(collection, requestId, request) {
  collection.requests ||= [];
  const requestIndex = collection.requests.findIndex((candidate) => candidate.id === requestId);
  if (requestIndex >= 0) {
    collection.requests[requestIndex] = cloneJson(request);
    return true;
  }
  for (const folder of collection.folders || []) {
    if (replaceRequestInFolder(folder, requestId, request)) {
      return true;
    }
  }
  return false;
}

function replaceRequestInFolder(folder, requestId, request) {
  folder.requests ||= [];
  const requestIndex = folder.requests.findIndex((candidate) => candidate.id === requestId);
  if (requestIndex >= 0) {
    folder.requests[requestIndex] = cloneJson(request);
    return true;
  }
  for (const child of folder.folders || []) {
    if (replaceRequestInFolder(child, requestId, request)) {
      return true;
    }
  }
  return false;
}

function ensureFolderPath(collection, folderPath) {
  let folders = collection.folders ||= [];
  let currentFolder = null;
  for (const segment of folderPath || []) {
    const folderId = segment?.id || '';
    let folder = folders.find((candidate) => candidate.id === folderId);
    if (!folder) {
      folder = {
        id: folderId,
        name: segment?.name || 'Untitled Folder',
        requests: [],
        folders: []
      };
      folders.push(folder);
    }
    folder.requests ||= [];
    folder.folders ||= [];
    currentFolder = folder;
    folders = folder.folders;
  }
  return currentFolder || collection;
}

module.exports = {
  applyEnvironmentSaveToWorkspace,
  applyCollectionRunMutationsToWorkspace,
  applyRequestSaveToWorkspace,
  applyWorkspaceSettingsSaveToWorkspace,
  applyScriptVariableMutationsToWorkspace,
  findWorkspaceRequestContext,
  updateWorkspaceRequestAuth
};
